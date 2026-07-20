import { env } from "../../config/env.js";
import { ApiError } from "../../utils/http.js";

async function embedBatch(inputs: string[]): Promise<number[][]> {
  if (!env.OPENROUTER_API_KEY) {
    throw new ApiError(503, "OpenRouter is not configured for embeddings.");
  }
  if (inputs.length === 0) return [];

  const response = await fetch("https://openrouter.ai/api/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": env.OPENROUTER_APP_URL,
      "X-Title": env.OPENROUTER_APP_NAME,
    },
    body: JSON.stringify({
      model: env.OPENROUTER_EMBEDDING_MODEL,
      input: inputs,
    }),
  });

  const body = await response.text();
  if (!response.ok) {
    throw new ApiError(502, `Embedding request failed (${response.status}): ${body.slice(0, 200)}`);
  }

  const parsed = JSON.parse(body) as {
    data?: Array<{ embedding?: number[]; index?: number }>;
  };
  const rows = parsed.data || [];
  const ordered = [...rows].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  return ordered.map((row) => {
    if (!row.embedding?.length) throw new ApiError(502, "Embedding response was incomplete.");
    return row.embedding;
  });
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  const batchSize = 32;
  const vectors: number[][] = [];
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    vectors.push(...(await embedBatch(batch)));
  }
  return vectors;
}

export async function embedQuery(text: string): Promise<number[]> {
  const [vector] = await embedTexts([text]);
  if (!vector) throw new ApiError(502, "Embedding response was empty.");
  return vector;
}
