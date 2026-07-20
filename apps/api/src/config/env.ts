import { config as loadEnv } from "dotenv";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const currentDir = dirname(fileURLToPath(import.meta.url));
const repoRootEnv = resolve(currentDir, "../../../../.env");
const localEnv = resolve(currentDir, "../../.env");

if (existsSync(repoRootEnv)) {
  loadEnv({ path: repoRootEnv, override: false });
} else if (existsSync(localEnv)) {
  loadEnv({ path: localEnv, override: false });
}

function optionalSetting() {
  return z.preprocess((value) => {
    if (typeof value !== "string") return value;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }, z.string().min(1).optional());
}

function booleanSetting(defaultValue = false) {
  return z.preprocess((value) => {
    if (value === undefined || value === null || value === "") return defaultValue;
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (["true", "1", "yes"].includes(normalized)) return true;
      if (["false", "0", "no"].includes(normalized)) return false;
    }
    return defaultValue;
  }, z.boolean());
}

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  WEB_ORIGIN: z.string().url().default("http://localhost:3000"),
  MONGODB_URI: z.string().min(1),
  REDIS_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(24),
  JWT_REFRESH_SECRET: z.string().min(24),
  COOKIE_DOMAIN: optionalSetting(),
  OPENROUTER_API_KEY: optionalSetting(),
  OPENROUTER_MODEL: optionalSetting(),
  OPENROUTER_CHAT_MODEL: optionalSetting(),
  OPENROUTER_EMBEDDING_MODEL: z.string().default("openai/text-embedding-3-small"),
  OPENROUTER_APP_URL: z.string().url().default("http://localhost:3000"),
  OPENROUTER_APP_NAME: z.string().default("PaperPilot"),
  UPLOADTHING_TOKEN: optionalSetting(),
  SENTRY_DSN: optionalSetting(),
  LOG_LEVEL: z.string().default("info"),
  ENABLE_RAG: booleanSetting(false),
  DATABASE_URL: optionalSetting(),
  RAG_TOP_K: z.coerce.number().int().positive().default(8),
  RAG_CHUNK_SIZE: z.coerce.number().int().positive().default(800),
  RAG_CHUNK_OVERLAP: z.coerce.number().int().nonnegative().default(120),
  RAG_EMBEDDING_DIMENSIONS: z.coerce.number().int().positive().default(1536),
  /** Initial answer + retries. Default 2 = one draft + one correction attempt. */
  RAG_MAX_ANSWER_ATTEMPTS: z.coerce.number().int().positive().default(2),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const keys = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
  throw new Error(`Missing or invalid environment settings: ${keys}`);
}

export const env = parsed.data;

/** Study Chat / RAG only. Assessment generation never reads this. */
export function ragEnabled() {
  return Boolean(env.ENABLE_RAG && env.DATABASE_URL && env.OPENROUTER_API_KEY);
}
