import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../config/env.js", () => ({
  env: {
    OPENROUTER_API_KEY: "test-key",
    OPENROUTER_MODEL: "test-model",
    OPENROUTER_CHAT_MODEL: undefined,
    OPENROUTER_APP_URL: "http://localhost:3000",
    OPENROUTER_APP_NAME: "PaperPilot",
    RAG_TOP_K: 8,
    RAG_MAX_ANSWER_ATTEMPTS: 2,
  },
  ragEnabled: vi.fn(() => true),
}));

vi.mock("../../config/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("./retrieve.service.js", () => ({
  retrieveChunks: vi.fn(),
  formatRetrievedContext: vi.fn(() => "[chunk 0]\nPlants convert light into energy."),
}));

import { ragEnabled } from "../../config/env.js";
import { ApiError } from "../../utils/http.js";
import {
  GROUNDING_REJECTION_MESSAGE,
  answerStudyQuestion,
  verifyGrounding,
} from "./chat.service.js";
import { retrieveChunks } from "./retrieve.service.js";

function chatResponse(content: string): Response {
  return {
    ok: true,
    text: async () =>
      JSON.stringify({
        choices: [{ message: { content } }],
      }),
  } as Response;
}

function groundedJson(grounded: boolean, unsupportedClaims: string[] = []) {
  return JSON.stringify({ grounded, unsupportedClaims });
}

describe("answerStudyQuestion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(ragEnabled).mockReturnValue(true);
    global.fetch = vi.fn();
  });

  it("throws when RAG is disabled", async () => {
    vi.mocked(ragEnabled).mockReturnValue(false);
    await expect(
      answerStudyQuestion({
        sourceDocumentId: "src1",
        workspaceId: "ws1",
        question: "What is photosynthesis?",
      }),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it("throws a clear error when the index has no chunks", async () => {
    vi.mocked(retrieveChunks).mockResolvedValue([]);
    await expect(
      answerStudyQuestion({
        sourceDocumentId: "src1",
        workspaceId: "ws1",
        question: "What is photosynthesis?",
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("returns a verified answer when the first draft passes grounding", async () => {
    vi.mocked(retrieveChunks).mockResolvedValue([
      { chunkIndex: 2, content: "Plants convert light into energy.", distance: 0.05 },
    ]);
    vi.mocked(global.fetch)
      .mockResolvedValueOnce(chatResponse("Photosynthesis converts light into chemical energy."))
      .mockResolvedValueOnce(chatResponse(groundedJson(true)));

    const result = await answerStudyQuestion({
      sourceDocumentId: "src1",
      workspaceId: "ws1",
      question: "What is photosynthesis?",
      fileName: "biology.pdf",
    });

    expect(result.answer).toContain("Photosynthesis");
    expect(result.groundingStatus).toBe("verified");
    expect(result.retryCount).toBe(0);
    expect(result.citations).toEqual([
      { chunkIndex: 2, snippet: "Plants convert light into energy." },
    ]);
    expect(result.metrics.totalMs).toBeGreaterThanOrEqual(0);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it("retries once and returns verified_after_retry when the second draft passes", async () => {
    vi.mocked(retrieveChunks).mockResolvedValue([
      { chunkIndex: 2, content: "Plants convert light into energy.", distance: 0.05 },
    ]);
    vi.mocked(global.fetch)
      .mockResolvedValueOnce(chatResponse("Photosynthesis was invented in 1999 by NASA."))
      .mockResolvedValueOnce(chatResponse(groundedJson(false, ["invented in 1999 by NASA"])))
      .mockResolvedValueOnce(chatResponse("Photosynthesis converts light into energy in plants."))
      .mockResolvedValueOnce(chatResponse(groundedJson(true)));

    const result = await answerStudyQuestion({
      sourceDocumentId: "src1",
      workspaceId: "ws1",
      question: "What is photosynthesis?",
    });

    expect(result.groundingStatus).toBe("verified_after_retry");
    expect(result.retryCount).toBe(1);
    expect(result.answer).toContain("converts light into energy");
    expect(result.answer).not.toContain("1999");
    expect(global.fetch).toHaveBeenCalledTimes(4);
  });

  it("rejects ungrounded answers after retry and never returns the hallucinated draft", async () => {
    vi.mocked(retrieveChunks).mockResolvedValue([
      { chunkIndex: 2, content: "Plants convert light into energy.", distance: 0.05 },
    ]);
    const hallucinated = "Photosynthesis requires plutonium cores and time travel.";
    vi.mocked(global.fetch)
      .mockResolvedValueOnce(chatResponse(hallucinated))
      .mockResolvedValueOnce(chatResponse(groundedJson(false, ["plutonium cores"])))
      .mockResolvedValueOnce(chatResponse(hallucinated))
      .mockResolvedValueOnce(chatResponse(groundedJson(false, ["plutonium cores", "time travel"])));

    const result = await answerStudyQuestion({
      sourceDocumentId: "src1",
      workspaceId: "ws1",
      question: "What is photosynthesis?",
    });

    expect(result.groundingStatus).toBe("rejected");
    expect(result.retryCount).toBe(1);
    expect(result.answer).toBe(GROUNDING_REJECTION_MESSAGE);
    expect(result.answer).not.toContain("plutonium");
    expect(result.citations).toHaveLength(1);
  });

  it("treats malformed verifier JSON as not grounded (fail closed) and retries then rejects", async () => {
    vi.mocked(retrieveChunks).mockResolvedValue([
      { chunkIndex: 2, content: "Plants convert light into energy.", distance: 0.05 },
    ]);
    vi.mocked(global.fetch)
      .mockResolvedValueOnce(chatResponse("Plants convert light into energy."))
      .mockResolvedValueOnce(chatResponse("not-json-at-all"))
      .mockResolvedValueOnce(chatResponse("Plants convert light into energy."))
      .mockResolvedValueOnce(chatResponse("still not json"));

    const result = await answerStudyQuestion({
      sourceDocumentId: "src1",
      workspaceId: "ws1",
      question: "What is photosynthesis?",
    });

    expect(result.groundingStatus).toBe("rejected");
    expect(result.answer).toBe(GROUNDING_REJECTION_MESSAGE);
  });
});

describe("verifyGrounding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it("parses fenced JSON verifier responses", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      chatResponse("```json\n{\"grounded\": true, \"unsupportedClaims\": []}\n```"),
    );

    const verdict = await verifyGrounding("Plants convert light into energy.", [
      { chunkIndex: 0, content: "Plants convert light into energy.", distance: 0.01 },
    ]);

    expect(verdict).toEqual({ grounded: true, unsupportedClaims: [] });
  });

  it("fail-closes when grounded field is missing", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(chatResponse(JSON.stringify({ unsupportedClaims: [] })));

    const verdict = await verifyGrounding("Anything", [
      { chunkIndex: 0, content: "context", distance: 0.01 },
    ]);

    expect(verdict.grounded).toBe(false);
  });
});
