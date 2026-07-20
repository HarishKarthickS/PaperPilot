import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { chunkText } from "./chunk.js";
import { ensureRagSchema, getRagPool, toPgVectorLiteral } from "./db.js";
import { embedTexts } from "./embed.js";

export async function indexSourceDocument(input: {
  sourceDocumentId: string;
  workspaceId: string;
  extractedText: string;
}) {
  await ensureRagSchema();
  const chunks = chunkText(input.extractedText, env.RAG_CHUNK_SIZE, env.RAG_CHUNK_OVERLAP);
  const pool = getRagPool();

  await pool.query("DELETE FROM document_chunks WHERE source_document_id = $1", [input.sourceDocumentId]);

  if (chunks.length === 0) {
    logger.info({ sourceDocumentId: input.sourceDocumentId }, "RAG index skipped: empty text");
    return { chunkCount: 0 };
  }

  const embeddings = await embedTexts(chunks.map((chunk) => chunk.content));
  if (embeddings.length !== chunks.length) {
    throw new Error("Embedding count did not match chunk count.");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (let i = 0; i < chunks.length; i += 1) {
      const chunk = chunks[i]!;
      const embedding = embeddings[i]!;
      if (embedding.length !== env.RAG_EMBEDDING_DIMENSIONS) {
        throw new Error(
          `Embedding dimension mismatch: expected ${env.RAG_EMBEDDING_DIMENSIONS}, got ${embedding.length}`,
        );
      }
      await client.query(
        `INSERT INTO document_chunks (source_document_id, workspace_id, chunk_index, content, embedding)
         VALUES ($1, $2, $3, $4, $5::vector)
         ON CONFLICT (source_document_id, chunk_index)
         DO UPDATE SET content = EXCLUDED.content, embedding = EXCLUDED.embedding, created_at = NOW()`,
        [input.sourceDocumentId, input.workspaceId, chunk.index, chunk.content, toPgVectorLiteral(embedding)],
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  logger.info(
    { sourceDocumentId: input.sourceDocumentId, chunkCount: chunks.length },
    "RAG document indexed",
  );
  return { chunkCount: chunks.length };
}
