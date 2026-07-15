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
  OPENROUTER_APP_URL: z.string().url().default("http://localhost:3000"),
  OPENROUTER_APP_NAME: z.string().default("PaperPilot"),
  UPLOADTHING_TOKEN: optionalSetting(),
  SENTRY_DSN: optionalSetting(),
  LOG_LEVEL: z.string().default("info"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const keys = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
  throw new Error(`Missing or invalid environment settings: ${keys}`);
}

export const env = parsed.data;
