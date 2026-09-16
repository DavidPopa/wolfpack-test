import { z } from "zod";

const configSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535),
  DATABASE_URL: z.string().url().startsWith("postgresql://"),
  REDIS_URL: z.string().url().startsWith("redis://"),
  READINESS_TIMEOUT_MS: z.coerce.number().int().min(50).max(10_000).default(1000)
});

export interface AppConfig { port: number; databaseUrl: string; redisUrl: string; readinessTimeoutMs: number }

export function loadConfig(environment: NodeJS.ProcessEnv): AppConfig {
  const parsed = configSchema.safeParse(environment);
  if (!parsed.success) {
    const fields = [...new Set(parsed.error.issues.map((issue) => issue.path.join(".")))].join(", ");
    throw new Error(`Invalid startup configuration: ${fields || "unknown field"}`);
  }
  return {
    port: parsed.data.PORT, databaseUrl: parsed.data.DATABASE_URL,
    redisUrl: parsed.data.REDIS_URL, readinessTimeoutMs: parsed.data.READINESS_TIMEOUT_MS
  };
}
