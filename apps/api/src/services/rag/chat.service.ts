import { env, ragEnabled } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { ApiError } from "../../utils/http.js";
import { formatRetrievedContext, retrieveChunks, type RetrievedChunk } from "./retrieve.service.js";

export type ChatCitation = {
  chunkIndex: number;
  snippet: string;
};

export type GroundingStatus = "verified" | "verified_after_retry" | "rejected";

export type StudyChatMetrics = {
  retrieveMs: number;
  generateMs: number;
  verifyMs: number;
  totalMs: number;
};

export type StudyChatAnswer = {
  answer: string;
  citations: ChatCitation[];
  groundingStatus: GroundingStatus;
  retryCount: 0 | 1;
  metrics: StudyChatMetrics;
};

export type GroundingVerdict = {
  grounded: boolean;
  unsupportedClaims: string[];
};

export type StudyChatDeps = {
  retrieveChunks?: typeof retrieveChunks;
  chatCompletion?: (system: string, user: string, temperature: number) => Promise<string>;
};

export const GROUNDING_REJECTION_MESSAGE =
  "I can't answer from the retrieved passages alone. The draft response was not fully grounded in the source excerpts, so it was withheld. Try rephrasing the question or asking about a topic covered in the document.";

function citationSnippet(content: string, max = 220) {
  const trimmed = content.replace(/\s+/g, " ").trim();
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max - 1)}…`;
}

function buildCitations(chunks: RetrievedChunk[]): ChatCitation[] {
  return chunks.map((chunk) => ({
    chunkIndex: chunk.chunkIndex,
    snippet: citationSnippet(chunk.content),
  }));
}

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() || trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Verifier response did not contain a JSON object.");
  }
  return JSON.parse(candidate.slice(start, end + 1));
}

export function parseGroundingVerdict(raw: string): GroundingVerdict {
  try {
    const parsed = extractJsonObject(raw) as {
      grounded?: unknown;
      unsupportedClaims?: unknown;
    };
    if (typeof parsed.grounded !== "boolean") {
      return { grounded: false, unsupportedClaims: ["Verifier response missing boolean grounded field."] };
    }
    const unsupportedClaims = Array.isArray(parsed.unsupportedClaims)
      ? parsed.unsupportedClaims.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      : [];
    return { grounded: parsed.grounded, unsupportedClaims };
  } catch {
    // Fail closed: malformed verifier output is treated as not grounded.
    return { grounded: false, unsupportedClaims: ["Verifier returned malformed JSON."] };
  }
}

async function openRouterChat(system: string, user: string, temperature: number) {
  if (!env.OPENROUTER_API_KEY) {
    throw new ApiError(503, "OpenRouter is not configured for Study Chat.");
  }
  const model = env.OPENROUTER_CHAT_MODEL || env.OPENROUTER_MODEL;
  if (!model) {
    throw new ApiError(503, "Set OPENROUTER_CHAT_MODEL or OPENROUTER_MODEL for Study Chat.");
  }

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": env.OPENROUTER_APP_URL,
      "X-Title": env.OPENROUTER_APP_NAME,
    },
    body: JSON.stringify({
      model,
      temperature,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  const body = await response.text();
  if (!response.ok) {
    throw new ApiError(502, `Study Chat model request failed (${response.status}): ${body.slice(0, 200)}`);
  }

  const parsed = JSON.parse(body) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const answer = parsed.choices?.[0]?.message?.content?.trim();
  if (!answer) throw new ApiError(502, "Study Chat returned an empty answer.");
  return answer;
}

function buildAnswerSystemPrompt(strict: boolean) {
  const lines = [
    "You are PaperPilot Study Chat, a careful tutor for teachers reviewing study material.",
    "Answer using only the provided source excerpts.",
    "If the excerpts do not contain enough information, say what is missing instead of inventing facts.",
    "Keep answers clear and concise. Mention chunk numbers when helpful.",
  ];
  if (strict) {
    lines.push(
      "A previous draft failed a grounding check. Do not repeat unsupported claims.",
      "Every factual statement must be directly supported by the excerpts. Prefer refusing over guessing.",
    );
  }
  return lines.join(" ");
}

function buildAnswerUserPrompt(input: {
  fileName?: string;
  context: string;
  question: string;
  unsupportedClaims?: string[];
}) {
  const parts = [
    input.fileName ? `Document: ${input.fileName}` : "Document: uploaded study material",
    "",
    "Source excerpts:",
    input.context,
    "",
    `Question: ${input.question}`,
  ];
  if (input.unsupportedClaims?.length) {
    parts.push(
      "",
      "Unsupported claims from the previous draft (do not repeat these unless the excerpts support them):",
      ...input.unsupportedClaims.map((claim) => `- ${claim}`),
    );
  }
  return parts.join("\n");
}

/** Exported for tests and the offline grounding eval script. */
export async function verifyGrounding(
  answer: string,
  chunks: RetrievedChunk[],
  deps?: Pick<StudyChatDeps, "chatCompletion">,
): Promise<GroundingVerdict> {
  const chat = deps?.chatCompletion ?? openRouterChat;
  const context = formatRetrievedContext(chunks);
  const system = [
    "You are a strict grounding verifier for a retrieval-augmented tutor.",
    "Decide whether the candidate answer is fully supported by the source excerpts.",
    "Reject answers that invent facts, numbers, names, or conclusions not present in the excerpts.",
    "If the answer correctly says the excerpts lack information, mark grounded=true.",
    'Respond with JSON only: {"grounded": boolean, "unsupportedClaims": string[]}',
    "unsupportedClaims must list concrete claims that are not supported. Use [] when grounded is true.",
  ].join(" ");

  const user = ["Source excerpts:", context, "", "Candidate answer:", answer].join("\n");
  const raw = await chat(system, user, 0);
  return parseGroundingVerdict(raw);
}

export async function answerStudyQuestion(
  input: {
    sourceDocumentId: string;
    workspaceId: string;
    question: string;
    fileName?: string;
  },
  deps?: StudyChatDeps,
): Promise<StudyChatAnswer> {
  if (!ragEnabled()) {
    throw new ApiError(503, "Study Chat is not configured. Set ENABLE_RAG, DATABASE_URL, and OPENROUTER_API_KEY.");
  }

  const question = input.question.trim();
  if (!question) throw new ApiError(400, "Message cannot be empty.");

  const retrieve = deps?.retrieveChunks ?? retrieveChunks;
  const chat = deps?.chatCompletion ?? openRouterChat;

  const startedAt = Date.now();
  let retrieveMs = 0;
  let generateMs = 0;
  let verifyMs = 0;

  const retrieveStarted = Date.now();
  const chunks: RetrievedChunk[] = await retrieve({
    sourceDocumentId: input.sourceDocumentId,
    workspaceId: input.workspaceId,
    query: question,
  });
  retrieveMs = Date.now() - retrieveStarted;

  if (chunks.length === 0) {
    throw new ApiError(
      409,
      "This document is not indexed for Study Chat yet. Wait for indexing to finish, then try again.",
    );
  }

  const context = formatRetrievedContext(chunks);
  const citations = buildCitations(chunks);
  const maxAttempts = Math.max(1, env.RAG_MAX_ANSWER_ATTEMPTS);
  let unsupportedClaims: string[] = [];
  let lastAnswer = "";
  let retryCount: 0 | 1 = 0;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const strict = attempt > 1;
    const generateStarted = Date.now();
    lastAnswer = await chat(
      buildAnswerSystemPrompt(strict),
      buildAnswerUserPrompt({
        fileName: input.fileName,
        context,
        question,
        unsupportedClaims: strict ? unsupportedClaims : undefined,
      }),
      0.2,
    );
    generateMs += Date.now() - generateStarted;

    const verifyStarted = Date.now();
    const verdict = await verifyGrounding(lastAnswer, chunks, { chatCompletion: chat });
    verifyMs += Date.now() - verifyStarted;

    if (verdict.grounded) {
      const groundingStatus: GroundingStatus = attempt === 1 ? "verified" : "verified_after_retry";
      retryCount = attempt === 1 ? 0 : 1;
      const metrics: StudyChatMetrics = {
        retrieveMs,
        generateMs,
        verifyMs,
        totalMs: Date.now() - startedAt,
      };
      logger.info(
        {
          feature: "study-chat",
          groundingStatus,
          retryCount,
          ...metrics,
          chunkCount: chunks.length,
        },
        "Study Chat answer grounded",
      );
      return {
        answer: lastAnswer,
        citations,
        groundingStatus,
        retryCount,
        metrics,
      };
    }

    unsupportedClaims = verdict.unsupportedClaims;
    if (attempt < maxAttempts) {
      retryCount = 1;
      logger.warn(
        {
          feature: "study-chat",
          attempt,
          unsupportedClaims,
          chunkCount: chunks.length,
        },
        "Study Chat answer failed grounding check; retrying",
      );
    }
  }

  const metrics: StudyChatMetrics = {
    retrieveMs,
    generateMs,
    verifyMs,
    totalMs: Date.now() - startedAt,
  };
  logger.warn(
    {
      feature: "study-chat",
      groundingStatus: "rejected",
      retryCount,
      ...metrics,
      unsupportedClaims,
      chunkCount: chunks.length,
    },
    "Study Chat answer rejected after grounding failures",
  );

  return {
    answer: GROUNDING_REJECTION_MESSAGE,
    citations,
    groundingStatus: "rejected",
    retryCount,
    metrics,
  };
}
