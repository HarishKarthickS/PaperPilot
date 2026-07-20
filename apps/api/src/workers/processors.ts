import { QueueEvents, Worker, type Job } from "bullmq";
import mammoth from "mammoth";
import pdfParse from "pdf-parse";
import { AssessmentRevision, Assignment, GenerationRun, SourceDocument } from "../models/index.js";
import { bullConnection, redis } from "../config/redis.js";
import { emitGenerationEvent } from "../socket/emitter.js";
import { generatePaper, regenerateQuestion, regenerateSection, repairPaperForAssignment } from "../services/ai.service.js";
import { buildAndStorePdf } from "../services/pdf.service.js";
import { issueSourceFileAccess } from "../services/file.service.js";
import { indexSourceDocument } from "../services/rag/index.service.js";
import { ApiError } from "../utils/http.js";
import { env, ragEnabled } from "../config/env.js";
import { logger } from "../config/logger.js";
import { ragIndexQueue } from "../queues/index.js";

const queueEvents: QueueEvents[] = [];

function safeGenerationFailureMessage(error: unknown) {
  if (error instanceof ApiError && error.statusCode < 500) return error.message;
  return "Generation failed after multiple attempts. Please try again in a moment.";
}

async function updateRun(
  runId: string,
  assignmentId: string,
  status: "processing" | "generating" | "parsing" | "finalizing" | "completed" | "failed",
  progress: number,
  message: string,
  revisionId?: string,
) {
  await Promise.all([
    GenerationRun.findByIdAndUpdate(runId, { status, progress, message, revisionId }),
    Assignment.findByIdAndUpdate(assignmentId, { status }),
    redis.set(`generation:${runId}`, JSON.stringify({ status, progress, message }), "EX", 3600),
  ]);
  logger.info({ runId, assignmentId, status, progress, revisionId }, "Generation phase updated");
  const event =
    status === "completed"
      ? "generation_completed"
      : status === "failed"
        ? "generation_failed"
        : progress === 10
          ? "generation_started"
          : "generation_progress";
  emitGenerationEvent(event, { assignmentId, runId, status, progress, message, revisionId });
}

async function processGeneration(job: Job<{ runId: string; assignmentId: string }>) {
  const { runId, assignmentId } = job.data;
  const startedAt = Date.now();
  logger.info(
    { queue: job.queueName, jobId: job.id, runId, assignmentId, attempt: job.attemptsMade + 1 },
    "Generation job started",
  );
  const run = await GenerationRun.findById(runId);
  const assignment = (await Assignment.findById(assignmentId).lean()) as any;
  if (!run || !assignment) throw new ApiError(404, "Generation request is missing.");

  try {
    await updateRun(runId, assignmentId, "processing", 10, "Analyzing assessment requirements");
    const source = assignment.sourceDocumentId
      ? (await SourceDocument.findById(assignment.sourceDocumentId).lean()) as any
      : null;
    if (source && source.extractionStatus !== "completed") {
      throw new ApiError(409, "Uploaded material is still being analyzed. Please try generation again shortly.");
    }

    const input = {
      ...assignment,
      dueDate: new Date(assignment.dueDate).toISOString(),
      material: source?.extractedText,
    } as any;
    const previous = assignment.currentRevisionId
      ? (await AssessmentRevision.findById(assignment.currentRevisionId).lean()) as any
      : null;

    await updateRun(runId, assignmentId, "generating", 35, "Generating balanced question sections");
    let sections: any[];
    let origin: string;
    if (run.action === "regenerated_question" && previous && run.targetQuestionId) {
      const containingSection = previous.sections.find((section: any) =>
        section.questions.some((question: any) => String(question._id) === run.targetQuestionId),
      );
      const oldQuestion = containingSection?.questions.find(
        (question: any) => String(question._id) === run.targetQuestionId,
      );
      if (!oldQuestion) throw new ApiError(404, "Question to regenerate was not found.");
      const replacement = await regenerateQuestion(input, oldQuestion);
      sections = previous.sections.map((section: any) => ({
        ...section,
        questions: section.questions.map((question: any) =>
          String(question._id) === run.targetQuestionId ? replacement : question,
        ),
      }));
      origin = "regenerated_question";
    } else if (run.action === "regenerated_section" && previous && run.targetSectionId) {
      const oldSection = previous.sections.find((section: any) => String(section._id) === run.targetSectionId);
      if (!oldSection) throw new ApiError(404, "Section to regenerate was not found.");
      const replacement = await regenerateSection(input, oldSection);
      sections = previous.sections.map((section: any) =>
        String(section._id) === run.targetSectionId ? replacement : section,
      );
      origin = "regenerated_section";
    } else {
      const paper = await generatePaper(input);
      sections = paper.sections;
      origin = run.action === "rebalanced" ? "rebalanced" : "initial";
    }
    sections = (await repairPaperForAssignment(input, { sections }, `finalize_${origin}`)).sections;

    await updateRun(runId, assignmentId, "parsing", 70, "Validating generated questions and marks");
    const version = (await AssessmentRevision.countDocuments({ assignmentId })) + 1;

    // Each result becomes a revision so teachers can regenerate confidently without losing prior papers.
    const revision = await AssessmentRevision.create({
      workspaceId: assignment.workspaceId,
      assignmentId,
      version,
      origin,
      sections,
      generatedByModel: env.OPENROUTER_MODEL,
      sourceRunId: run._id,
    });
    for (const section of revision.sections) {
      emitGenerationEvent("section_generated", {
        assignmentId,
        runId,
        status: "finalizing",
        progress: 82,
        message: `Prepared ${section.title}`,
        sectionTitle: section.title,
      });
    }
    await updateRun(runId, assignmentId, "finalizing", 90, "Finalizing assessment paper");
    await Assignment.findByIdAndUpdate(assignmentId, { currentRevisionId: revision._id });
    await updateRun(runId, assignmentId, "completed", 100, "Assessment is ready", revision.id);
    logger.info(
      { runId, assignmentId, revisionId: revision.id, durationMs: Date.now() - startedAt },
      "Generation job completed",
    );
  } catch (error) {
    const detailedMessage = error instanceof Error ? error.message : "Generation failed.";
    const message = safeGenerationFailureMessage(error);
    logger.error(
      {
        runId,
        assignmentId,
        jobId: job.id,
        attempt: job.attemptsMade + 1,
        durationMs: Date.now() - startedAt,
        error: detailedMessage,
      },
      "Generation job failed",
    );
    await GenerationRun.findByIdAndUpdate(runId, { error: message });
    await updateRun(runId, assignmentId, "failed", 100, message);
    throw error;
  }
}

async function extractText(job: Job<{ sourceDocumentId: string }>) {
  const startedAt = Date.now();
  const source = await SourceDocument.findById(job.data.sourceDocumentId);
  if (!source) return;
  source.extractionStatus = "processing";
  await source.save();
  logger.info(
    {
      queue: job.queueName,
      jobId: job.id,
      sourceDocumentId: source.id,
      workspaceId: source.workspaceId.toString(),
      attempt: job.attemptsMade + 1,
    },
    "Document extraction started",
  );
  try {
    const signed = await issueSourceFileAccess(source.id, source.workspaceId.toString());
    const response = await fetch(signed.ufsUrl);
    if (!response.ok) throw new Error("Uploaded file could not be read.");
    const bytes = Buffer.from(await response.arrayBuffer());
    let text = "";
    if (source.fileType.includes("pdf")) {
      text = (await pdfParse(bytes)).text;
    } else if (source.fileType.includes("wordprocessingml")) {
      text = (await mammoth.extractRawText({ buffer: bytes })).value;
    } else {
      text = bytes.toString("utf8");
    }
    source.extractedText = text.replace(/\s+/g, " ").trim().slice(0, 50_000);
    source.extractionStatus = "completed";
    await source.save();
    logger.info(
      { sourceDocumentId: source.id, extractedCharacters: source.extractedText.length, durationMs: Date.now() - startedAt },
      "Document extraction completed",
    );

    // Study Chat indexing is fire-and-forget and must never fail extraction / block generation.
    if (ragEnabled()) {
      try {
        source.ragIndexStatus = "queued";
        source.ragIndexError = undefined;
        await source.save();
        await ragIndexQueue.add("index", { sourceDocumentId: source.id }, { attempts: 2 });
      } catch (error) {
        logger.warn(
          {
            sourceDocumentId: source.id,
            error: error instanceof Error ? error.message : "RAG enqueue failed",
          },
          "RAG index enqueue skipped",
        );
      }
    }
  } catch (error) {
    source.extractionStatus = "failed";
    source.extractionError = error instanceof Error ? error.message : "Text extraction failed.";
    await source.save();
    logger.error(
      { sourceDocumentId: source.id, durationMs: Date.now() - startedAt, error: source.extractionError },
      "Document extraction failed",
    );
    throw error;
  }
}

async function indexDocumentForRag(job: Job<{ sourceDocumentId: string }>) {
  const startedAt = Date.now();
  const source = await SourceDocument.findById(job.data.sourceDocumentId);
  if (!source?.extractedText) return;
  if (!ragEnabled()) return;

  source.ragIndexStatus = "processing";
  source.ragIndexError = undefined;
  await source.save();
  logger.info(
    { queue: job.queueName, jobId: job.id, sourceDocumentId: source.id, attempt: job.attemptsMade + 1 },
    "RAG indexing started",
  );

  try {
    const result = await indexSourceDocument({
      sourceDocumentId: source.id,
      workspaceId: source.workspaceId.toString(),
      extractedText: source.extractedText,
    });
    source.ragIndexStatus = "completed";
    source.ragIndexedAt = new Date();
    source.ragIndexError = undefined;
    await source.save();
    logger.info(
      {
        sourceDocumentId: source.id,
        chunkCount: result.chunkCount,
        durationMs: Date.now() - startedAt,
      },
      "RAG indexing completed",
    );
  } catch (error) {
    source.ragIndexStatus = "failed";
    source.ragIndexError = error instanceof Error ? error.message : "RAG indexing failed.";
    await source.save();
    logger.error(
      {
        sourceDocumentId: source.id,
        durationMs: Date.now() - startedAt,
        error: source.ragIndexError,
      },
      "RAG indexing failed",
    );
    throw error;
  }
}

function attachWorkerLogging(worker: Worker, queueName: string) {
  worker.on("completed", (job) => {
    logger.info(
      { queue: queueName, jobId: job.id, attemptsMade: job.attemptsMade, durationMs: Date.now() - job.timestamp },
      "Worker job completed",
    );
  });
  worker.on("failed", (job, error) => {
    logger.error(
      {
        queue: queueName,
        jobId: job?.id,
        attemptsMade: job?.attemptsMade,
        failedReason: job?.failedReason,
        error: error.message,
      },
      "Worker job failed",
    );
  });
  worker.on("error", (error) => {
    logger.error({ queue: queueName, error: error.message }, "Worker runtime error");
  });

  const events = new QueueEvents(queueName, { connection: bullConnection });
  events.on("stalled", ({ jobId }) => logger.warn({ queue: queueName, jobId }, "Worker job stalled"));
  events.on("failed", ({ jobId, failedReason }) =>
    logger.error({ queue: queueName, jobId, failedReason }, "Queue event reported job failure"),
  );
  events.on("completed", ({ jobId }) => logger.info({ queue: queueName, jobId }, "Queue event reported job completion"));
  events.on("error", (error) => logger.error({ queue: queueName, error: error.message }, "Queue event error"));
  queueEvents.push(events);
}

export function startWorkers() {
  const generationWorker = new Worker("assessment-generation", processGeneration, {
    connection: bullConnection,
    concurrency: 3,
  });
  const extractionWorker = new Worker("document-extraction", extractText, {
    connection: bullConnection,
    concurrency: 2,
  });
  const ragIndexWorker = new Worker("document-rag-indexing", indexDocumentForRag, {
    connection: bullConnection,
    concurrency: 1,
  });
  const pdfWorker = new Worker(
    "pdf-export",
    async (job: Job<{ exportId: string }>) => {
      const startedAt = Date.now();
      logger.info(
        { queue: job.queueName, jobId: job.id, exportId: job.data.exportId, attempt: job.attemptsMade + 1 },
        "PDF export job started",
      );
      try {
        const result = await buildAndStorePdf(job.data.exportId);
        logger.info(
          { queue: job.queueName, jobId: job.id, exportId: job.data.exportId, durationMs: Date.now() - startedAt },
          "PDF export job completed",
        );
        return result;
      } catch (error) {
        logger.error(
          {
            queue: job.queueName,
            jobId: job.id,
            exportId: job.data.exportId,
            durationMs: Date.now() - startedAt,
            error: error instanceof Error ? error.message : "PDF export failed",
          },
          "PDF export job failed",
        );
        throw error;
      }
    },
    { connection: bullConnection, concurrency: 2 },
  );
  attachWorkerLogging(generationWorker, "assessment-generation");
  attachWorkerLogging(extractionWorker, "document-extraction");
  attachWorkerLogging(ragIndexWorker, "document-rag-indexing");
  attachWorkerLogging(pdfWorker, "pdf-export");
  return [generationWorker, extractionWorker, ragIndexWorker, pdfWorker];
}
