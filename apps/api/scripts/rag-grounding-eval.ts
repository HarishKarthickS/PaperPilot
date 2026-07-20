/**
 * Offline Study Chat grounding eval.
 *
 * Fixture mode (default): injects mocked retrieve + chat completions into the
 * real verify → retry → reject path and reports grounding pass rate + p50 latency.
 *
 * Live mode: RAG_EVAL_LIVE=1 with OPENROUTER_API_KEY runs verifyGrounding against
 * fixed answer/chunk pairs (no pgvector required).
 *
 * Usage from apps/api:
 *   npx tsx scripts/rag-grounding-eval.ts
 *   RAG_EVAL_LIVE=1 npx tsx scripts/rag-grounding-eval.ts
 */

import { pathToFileURL } from "node:url";

type GroundingStatus = "verified" | "verified_after_retry" | "rejected";

type EvalCase = {
  id: string;
  question: string;
  chunkContent: string;
  /** Alternating answer then verifier JSON strings. */
  responses: string[];
  expectedStatus: GroundingStatus;
};

function verdict(grounded: boolean, unsupportedClaims: string[] = []) {
  return JSON.stringify({ grounded, unsupportedClaims });
}

const FIXTURE_CASES: EvalCase[] = [
  {
    id: "grounded-first-pass",
    question: "What do plants convert light into?",
    chunkContent: "Plants convert light into chemical energy through photosynthesis.",
    responses: [
      "Plants convert light into chemical energy through photosynthesis.",
      verdict(true),
    ],
    expectedStatus: "verified",
  },
  {
    id: "retry-then-grounded",
    question: "What do plants convert light into?",
    chunkContent: "Plants convert light into chemical energy through photosynthesis.",
    responses: [
      "Photosynthesis was patented by Edison in 1882.",
      verdict(false, ["patented by Edison in 1882"]),
      "Plants convert light into chemical energy through photosynthesis.",
      verdict(true),
    ],
    expectedStatus: "verified_after_retry",
  },
  {
    id: "reject-ungrounded",
    question: "What do plants convert light into?",
    chunkContent: "Plants convert light into chemical energy through photosynthesis.",
    responses: [
      "Photosynthesis requires plutonium and wormholes.",
      verdict(false, ["plutonium", "wormholes"]),
      "Photosynthesis requires plutonium and wormholes.",
      verdict(false, ["plutonium", "wormholes"]),
    ],
    expectedStatus: "rejected",
  },
  {
    id: "malformed-verifier-fail-closed",
    question: "What do plants convert light into?",
    chunkContent: "Plants convert light into chemical energy through photosynthesis.",
    responses: [
      "Plants convert light into chemical energy through photosynthesis.",
      "not-json",
      "Plants convert light into chemical energy through photosynthesis.",
      "still-broken",
    ],
    expectedStatus: "rejected",
  },
  {
    id: "refusal-when-missing-is-grounded",
    question: "Who invented photosynthesis?",
    chunkContent: "Plants convert light into chemical energy through photosynthesis.",
    responses: [
      "The excerpts do not name an inventor of photosynthesis.",
      verdict(true),
    ],
    expectedStatus: "verified",
  },
  {
    id: "numeric-hallucination-rejected",
    question: "How efficient is photosynthesis?",
    chunkContent: "Plants convert light into chemical energy through photosynthesis.",
    responses: [
      "Photosynthesis is exactly 97.4% efficient in all plants.",
      verdict(false, ["exactly 97.4% efficient"]),
      "Photosynthesis efficiency is always 97.4%.",
      verdict(false, ["always 97.4%"]),
    ],
    expectedStatus: "rejected",
  },
];

function percentile(sorted: number[], p: number) {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index]!;
}

function ensureEvalEnv() {
  process.env.NODE_ENV = process.env.NODE_ENV || "test";
  process.env.ENABLE_RAG = "true";
  process.env.DATABASE_URL =
    process.env.DATABASE_URL || "postgresql://paperpilot:paperpilot@localhost:5432/paperpilot_rag";
  process.env.OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || "eval-fixture-key";
  process.env.OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || "test-model";
  process.env.MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/vedaai-eval";
  process.env.REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
  process.env.JWT_ACCESS_SECRET =
    process.env.JWT_ACCESS_SECRET || "eval-access-secret-at-least-24-chars";
  process.env.JWT_REFRESH_SECRET =
    process.env.JWT_REFRESH_SECRET || "eval-refresh-secret-at-least-24-chars";
  process.env.RAG_MAX_ANSWER_ATTEMPTS = process.env.RAG_MAX_ANSWER_ATTEMPTS || "2";
}

async function loadChatService() {
  ensureEvalEnv();
  return import("../src/services/rag/chat.service.js");
}

async function runFixtureEval() {
  const { answerStudyQuestion, parseGroundingVerdict } = await loadChatService();

  const latencies: number[] = [];
  let matched = 0;
  let acceptMatched = 0;
  let rejectMatched = 0;

  for (const fixture of FIXTURE_CASES) {
    let call = 0;
    const result = await answerStudyQuestion(
      {
        sourceDocumentId: "eval-source",
        workspaceId: "eval-workspace",
        question: fixture.question,
        fileName: "eval.txt",
      },
      {
        retrieveChunks: async () => [
          { chunkIndex: 0, content: fixture.chunkContent, distance: 0.05 },
        ],
        chatCompletion: async () => {
          const next = fixture.responses[call] ?? verdict(false, ["missing fixture response"]);
          call += 1;
          await new Promise((resolve) => setTimeout(resolve, 2));
          return next;
        },
      },
    );

    latencies.push(result.metrics.totalMs);
    const statusOk = result.groundingStatus === fixture.expectedStatus;
    if (statusOk) {
      matched += 1;
      if (fixture.expectedStatus === "rejected") rejectMatched += 1;
      else acceptMatched += 1;
    }

    console.log(
      [
        statusOk ? "PASS" : "FAIL",
        fixture.id,
        `status=${result.groundingStatus}`,
        `expected=${fixture.expectedStatus}`,
        `totalMs=${result.metrics.totalMs}`,
        `retryCount=${result.retryCount}`,
      ].join(" | "),
    );
  }

  const malformed = parseGroundingVerdict("not-json");
  if (malformed.grounded) {
    throw new Error("parseGroundingVerdict should fail closed on malformed JSON");
  }

  const sorted = [...latencies].sort((a, b) => a - b);
  const n = FIXTURE_CASES.length;
  const expectedAccept = FIXTURE_CASES.filter((item) => item.expectedStatus !== "rejected").length;
  const expectedReject = n - expectedAccept;
  const scenarioMatchRate = (matched / n) * 100;
  const acceptRate = expectedAccept ? (acceptMatched / expectedAccept) * 100 : 0;
  const hallucinationRejectRate = expectedReject ? (rejectMatched / expectedReject) * 100 : 0;
  const p50 = percentile(sorted, 50);

  console.log("");
  console.log("=== Study Chat grounding eval (fixture) ===");
  console.log(`cases: ${n}`);
  console.log(`scenario match rate: ${scenarioMatchRate.toFixed(1)}% (${matched}/${n})`);
  console.log(`accept accuracy: ${acceptRate.toFixed(1)}% (${acceptMatched}/${expectedAccept})`);
  console.log(
    `hallucination reject rate: ${hallucinationRejectRate.toFixed(1)}% (${rejectMatched}/${expectedReject})`,
  );
  console.log(`p50 totalMs: ${p50}`);
  console.log(`p95 totalMs: ${percentile(sorted, 95)}`);
  console.log(
    "Guardrail: rejects answers not grounded in retrieved chunks (verify → 1 retry → refuse).",
  );

  return {
    mode: "fixture" as const,
    cases: n,
    matched,
    acceptMatched,
    rejectMatched,
    expectedAccept,
    expectedReject,
    scenarioMatchRate,
    acceptRate,
    hallucinationRejectRate,
    p50,
  };
}

async function runLiveVerifyEval() {
  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error("RAG_EVAL_LIVE=1 requires OPENROUTER_API_KEY");
  }
  const { verifyGrounding } = await loadChatService();

  const liveCases = [
    {
      id: "live-supported",
      answer: "Plants convert light into chemical energy through photosynthesis.",
      chunk: "Plants convert light into chemical energy through photosynthesis.",
      expectGrounded: true,
    },
    {
      id: "live-hallucination",
      answer: "Photosynthesis was invented by Thomas Edison in 1882 using steam turbines.",
      chunk: "Plants convert light into chemical energy through photosynthesis.",
      expectGrounded: false,
    },
    {
      id: "live-honest-refusal",
      answer: "The provided excerpts do not specify who invented photosynthesis.",
      chunk: "Plants convert light into chemical energy through photosynthesis.",
      expectGrounded: true,
    },
    {
      id: "live-numeric-hallucination",
      answer: "Photosynthesis is exactly 97.4% efficient in every plant species.",
      chunk: "Plants convert light into chemical energy through photosynthesis.",
      expectGrounded: false,
    },
  ];

  const latencies: number[] = [];
  let correct = 0;
  let trueRejects = 0;
  let hallucinationCases = 0;

  for (const item of liveCases) {
    const started = Date.now();
    const verdictResult = await verifyGrounding(item.answer, [
      { chunkIndex: 0, content: item.chunk, distance: 0.01 },
    ]);
    const elapsed = Date.now() - started;
    latencies.push(elapsed);

    const ok = verdictResult.grounded === item.expectGrounded;
    if (ok) correct += 1;
    if (!item.expectGrounded) {
      hallucinationCases += 1;
      if (!verdictResult.grounded) trueRejects += 1;
    }

    console.log(
      [
        ok ? "PASS" : "FAIL",
        item.id,
        `grounded=${verdictResult.grounded}`,
        `expected=${item.expectGrounded}`,
        `ms=${elapsed}`,
      ].join(" | "),
    );
  }

  const sorted = [...latencies].sort((a, b) => a - b);
  const n = liveCases.length;
  const accuracy = (correct / n) * 100;
  const hallucinationRejectRate = hallucinationCases
    ? (trueRejects / hallucinationCases) * 100
    : 0;

  console.log("");
  console.log("=== Study Chat grounding eval (live verifier) ===");
  console.log(`cases: ${n}`);
  console.log(`verifier accuracy: ${accuracy.toFixed(1)}% (${correct}/${n})`);
  console.log(
    `hallucination reject rate: ${hallucinationRejectRate.toFixed(1)}% (${trueRejects}/${hallucinationCases})`,
  );
  console.log(`p50 verifyMs: ${percentile(sorted, 50)}`);
  console.log(
    "Guardrail: rejects answers not grounded in retrieved chunks (verify → 1 retry → refuse).",
  );

  return {
    mode: "live" as const,
    cases: n,
    correct,
    accuracy,
    hallucinationRejectRate,
    p50: percentile(sorted, 50),
  };
}

async function main() {
  const live = process.env.RAG_EVAL_LIVE === "1" || process.env.RAG_EVAL_LIVE === "true";
  const summary = live ? await runLiveVerifyEval() : await runFixtureEval();
  if (summary.mode === "fixture" && summary.matched < summary.cases) {
    process.exitCode = 1;
  }
  if (summary.mode === "live" && summary.correct < summary.cases) {
    process.exitCode = 1;
  }
}

const entry = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === entry) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
