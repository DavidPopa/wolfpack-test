import { z } from "zod";
import type { WriteRateLimitConfig } from "./rate-limit/index.js";

const boundedRateLimitInteger = (maximum: number, fallback: number) =>
  z.coerce.number().int().min(1).max(maximum).default(fallback);

const configSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535),
  DATABASE_URL: z.string().url().startsWith("postgresql://"),
  REDIS_URL: z.string().url().startsWith("redis://"),
  READINESS_TIMEOUT_MS: z.coerce.number().int().min(50).max(10_000).default(1000),
  BETTER_AUTH_SECRET: z.string().min(32).refine((value) => value === value.trim()),
  BETTER_AUTH_URL: z.string().min(1),
  BETTER_AUTH_TRUSTED_ORIGINS: z.string().min(1),
  GOOGLE_CLIENT_ID: z.string().min(1).refine((value) => value === value.trim()),
  GOOGLE_CLIENT_SECRET: z.string().min(1).refine((value) => value === value.trim()),
  RATE_LIMIT_KEY_PREFIX: z.string().min(1).max(64).regex(/^[a-z0-9:_-]+$/).default("mapchat:write"),
  ROOM_RATE_LIMIT_MAX: boundedRateLimitInteger(1000, 5),
  ROOM_RATE_LIMIT_WINDOW_SECONDS: boundedRateLimitInteger(3600, 60),
  MESSAGE_RATE_LIMIT_MAX: boundedRateLimitInteger(1000, 30),
  MESSAGE_RATE_LIMIT_WINDOW_SECONDS: boundedRateLimitInteger(3600, 60)
});

export interface AuthConfig {
  secret: string;
  baseUrl: string;
  trustedOrigins: string[];
  googleClientId: string;
  googleClientSecret: string;
}

export interface AppConfig {
  port: number;
  databaseUrl: string;
  redisUrl: string;
  readinessTimeoutMs: number;
  auth: AuthConfig;
  rateLimit: WriteRateLimitConfig;
}

function parseCanonicalOrigin(value: string, field: string): string {
  try {
    const url = new URL(value);
    const isLoopback = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
    if (
      !["http:", "https:"].includes(url.protocol) ||
      (url.protocol === "http:" && !isLoopback) ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash ||
      value !== url.origin
    ) {
      throw new Error("not a canonical origin");
    }
    return url.origin;
  } catch {
    throw new Error(`Invalid startup configuration: ${field}`);
  }
}

export function loadConfig(environment: NodeJS.ProcessEnv): AppConfig {
  const parsed = configSchema.safeParse(environment);
  if (!parsed.success) {
    const fields = [...new Set(parsed.error.issues.map((issue) => issue.path.join(".")))].join(", ");
    throw new Error(`Invalid startup configuration: ${fields || "unknown field"}`);
  }

  const baseUrl = parseCanonicalOrigin(parsed.data.BETTER_AUTH_URL, "BETTER_AUTH_URL");
  const trustedOriginValues = parsed.data.BETTER_AUTH_TRUSTED_ORIGINS.split(",");
  if (trustedOriginValues.some((origin) => !origin)) {
    throw new Error("Invalid startup configuration: BETTER_AUTH_TRUSTED_ORIGINS");
  }
  const trustedOrigins = trustedOriginValues.map((origin) =>
    parseCanonicalOrigin(origin, "BETTER_AUTH_TRUSTED_ORIGINS")
  );
  if (new Set(trustedOrigins).size !== trustedOrigins.length || !trustedOrigins.includes(baseUrl)) {
    throw new Error("Invalid startup configuration: BETTER_AUTH_TRUSTED_ORIGINS");
  }

  return {
    port: parsed.data.PORT, databaseUrl: parsed.data.DATABASE_URL,
    redisUrl: parsed.data.REDIS_URL, readinessTimeoutMs: parsed.data.READINESS_TIMEOUT_MS,
    auth: {
      secret: parsed.data.BETTER_AUTH_SECRET,
      baseUrl,
      trustedOrigins,
      googleClientId: parsed.data.GOOGLE_CLIENT_ID,
      googleClientSecret: parsed.data.GOOGLE_CLIENT_SECRET
    },
    rateLimit: {
      keyPrefix: parsed.data.RATE_LIMIT_KEY_PREFIX,
      policies: {
        room: {
          limit: parsed.data.ROOM_RATE_LIMIT_MAX,
          windowSeconds: parsed.data.ROOM_RATE_LIMIT_WINDOW_SECONDS
        },
        message: {
          limit: parsed.data.MESSAGE_RATE_LIMIT_MAX,
          windowSeconds: parsed.data.MESSAGE_RATE_LIMIT_WINDOW_SECONDS
        }
      }
    }
  };
}
