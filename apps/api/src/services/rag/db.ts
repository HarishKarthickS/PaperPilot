import pg from "pg";
import { env, ragEnabled } from "../../config/env.js";
import { logger } from "../../config/logger.js";

const { Pool } = pg;

let pool: pg.Pool | null = null;
let schemaReady = false;

export function getRagPool() {
  if (!ragEnabled() || !env.DATABASE_URL) {
    throw new Error("RAG is not configured.");
  }
  if (!pool) {
    pool = new Pool({ connectionString: env.DATABASE_URL });
    pool.on("error", (error) => {
      logger.error({ error: error.message }, "RAG Postgres pool error");
    });
  }
  return pool;
}

export async function ensureRagSchema() {
  if (!ragEnabled()) return;
  if (schemaReady) return;
  const client = await getRagPool().connect();
  const dimensions = env.RAG_EMBEDDING_DIMENSIONS;
  try {
    await client.query("CREATE EXTENSION IF NOT EXISTS vector");
    await client.query(`
      CREATE TABLE IF NOT EXISTS document_chunks (
        id BIGSERIAL PRIMARY KEY,
        source_document_id TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        chunk_index INT NOT NULL,
        content TEXT NOT NULL,
        embedding vector(${dimensions}) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (source_document_id, chunk_index)
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS document_chunks_source_idx
      ON document_chunks (source_document_id)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS document_chunks_workspace_idx
      ON document_chunks (workspace_id)
    `);
    // HNSW may fail on empty tables in some versions; ignore if already exists or unsupported.
    try {
      await client.query(`
        CREATE INDEX IF NOT EXISTS document_chunks_embedding_idx
        ON document_chunks USING hnsw (embedding vector_cosine_ops)
      `);
    } catch (error) {
      logger.warn(
        { error: error instanceof Error ? error.message : "hnsw index skipped" },
        "RAG embedding index not created",
      );
    }
    schemaReady = true;
    logger.info({ dimensions }, "RAG Postgres schema ready");
  } finally {
    client.release();
  }
}

export async function closeRagPool() {
  if (pool) {
    await pool.end();
    pool = null;
    schemaReady = false;
  }
}

export function toPgVectorLiteral(values: number[]) {
  return `[${values.join(",")}]`;
}
