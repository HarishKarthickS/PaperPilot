import { env } from "../../config/env.js";
import { ensureRagSchema, getRagPool, toPgVectorLiteral } from "./db.js";
import { embedQuery } from "./embed.js";

export type RetrievedChunk = {
  chunkIndex: number;
  content: string;
  distance: number;
};

export async function retrieveChunks(input: {
  sourceDocumentId: string;
  workspaceId: string;
  query: string;
  topK?: number;
}): Promise<RetrievedChunk[]> {
  await ensureRagSchema();
  const queryEmbedding = await embedQuery(input.query);
  const topK = input.topK ?? env.RAG_TOP_K;
  const result = await getRagPool().query<{
    chunk_index: number;
    content: string;
    distance: number;
  }>(
    `SELECT chunk_index, content, (embedding <=> $1::vector) AS distance
     FROM document_chunks
     WHERE source_document_id = $2 AND workspace_id = $3
     ORDER BY embedding <=> $1::vector
     LIMIT $4`,
    [toPgVectorLiteral(queryEmbedding), input.sourceDocumentId, input.workspaceId, topK],
  );

  return result.rows.map((row) => ({
    chunkIndex: row.chunk_index,
    content: row.content,
    distance: Number(row.distance),
  }));
}

export function formatRetrievedContext(chunks: RetrievedChunk[], maxChars = 12_000) {
  const parts: string[] = [];
  let used = 0;
  for (const chunk of chunks) {
    const block = `[chunk ${chunk.chunkIndex}]\n${chunk.content}`;
    if (used + block.length + 2 > maxChars) break;
    parts.push(block);
    used += block.length + 2;
  }
  return parts.join("\n\n");
}
