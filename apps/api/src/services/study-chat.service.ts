import { StudyChatSession, StudyChatMessage, SourceDocument } from "../models/index.js";
import { ragEnabled } from "../config/env.js";
import { ApiError } from "../utils/http.js";
import { answerStudyQuestion } from "./rag/chat.service.js";
import { ragIndexQueue } from "../queues/index.js";

type Actor = { userId: string; workspaceId: string; role: string };

export function getStudyChatFeatures() {
  return { studyChatAvailable: ragEnabled() };
}

export async function listStudyChatSources(actor: Actor) {
  const sources = await SourceDocument.find({
    workspaceId: actor.workspaceId,
    extractionStatus: "completed",
  })
    .select("fileName fileType fileSize extractionStatus ragIndexStatus ragIndexedAt ragIndexError createdAt updatedAt")
    .sort({ updatedAt: -1 })
    .lean();
  return sources;
}

export async function createStudyChatSession(actor: Actor, sourceDocumentId: string) {
  if (!ragEnabled()) {
    throw new ApiError(503, "Study Chat is not configured. Set ENABLE_RAG, DATABASE_URL, and OPENROUTER_API_KEY.");
  }

  const source = await SourceDocument.findOne({
    _id: sourceDocumentId,
    workspaceId: actor.workspaceId,
    extractionStatus: "completed",
  });
  if (!source) throw new ApiError(404, "Source document not found or not ready.");

  if (source.ragIndexStatus === "failed" || source.ragIndexStatus === "idle" || !source.ragIndexStatus) {
    // Best-effort re-queue; chat still requires completed index later.
    try {
      source.ragIndexStatus = "queued";
      await source.save();
      await ragIndexQueue.add("index", { sourceDocumentId: source.id }, { attempts: 2 });
    } catch {
      // Ignore enqueue failures; message endpoint will report if index is missing.
    }
  }

  const session = await StudyChatSession.create({
    workspaceId: actor.workspaceId,
    sourceDocumentId: source.id,
    createdBy: actor.userId,
    title: `Chat · ${source.fileName}`,
  });

  return {
    session: session.toObject(),
    source: {
      _id: source.id,
      fileName: source.fileName,
      ragIndexStatus: source.ragIndexStatus,
    },
  };
}

export async function getStudyChatSession(actor: Actor, sessionId: string) {
  const session = await StudyChatSession.findOne({ _id: sessionId, workspaceId: actor.workspaceId }).lean();
  if (!session) throw new ApiError(404, "Chat session not found.");
  const messages = await StudyChatMessage.find({ sessionId }).sort({ createdAt: 1 }).lean();
  const sourceDocumentId = String((session as { sourceDocumentId: unknown }).sourceDocumentId);
  const source = await SourceDocument.findById(sourceDocumentId)
    .select("fileName ragIndexStatus")
    .lean();
  return { session, messages, source };
}

export async function postStudyChatMessage(actor: Actor, sessionId: string, content: string) {
  if (!ragEnabled()) {
    throw new ApiError(503, "Study Chat is not configured.");
  }

  const session = await StudyChatSession.findOne({ _id: sessionId, workspaceId: actor.workspaceId });
  if (!session) throw new ApiError(404, "Chat session not found.");

  const source = await SourceDocument.findOne({
    _id: session.sourceDocumentId,
    workspaceId: actor.workspaceId,
  });
  if (!source) throw new ApiError(404, "Source document not found.");
  if (source.ragIndexStatus !== "completed") {
    throw new ApiError(
      409,
      source.ragIndexStatus === "failed"
        ? "Document indexing failed. Re-upload or wait for a retry."
        : "Document is still being indexed for Study Chat.",
    );
  }

  const userMessage = await StudyChatMessage.create({
    sessionId: session.id,
    workspaceId: actor.workspaceId,
    role: "user",
    content: content.trim(),
  });

  const result = await answerStudyQuestion({
    sourceDocumentId: source.id,
    workspaceId: actor.workspaceId,
    question: content,
    fileName: source.fileName,
  });

  const assistantMessage = await StudyChatMessage.create({
    sessionId: session.id,
    workspaceId: actor.workspaceId,
    role: "assistant",
    content: result.answer,
    citations: result.citations,
    groundingStatus: result.groundingStatus,
    retryCount: result.retryCount,
    latencyMs: result.metrics.totalMs,
  });

  return { userMessage, assistantMessage };
}
