import type { Express } from "express";
import { Pool } from "pg";
import { createClient } from "redis";
import { createApp } from "./app.js";
import { createAuthBoundary, type AuthBoundary } from "./auth.js";
import { loadConfig, type AuthConfig } from "./config.js";
import { createPrismaClient, type RuntimePrismaClient } from "./prisma.js";
import { createProbeDependencies } from "./readiness.js";
import { createPrismaRoomReadRepository } from "./rooms/repository.js";
import { createRoomListService } from "./rooms/service.js";
import { createAppServer, type RunningServer } from "./server.js";

export interface RuntimePool {
  query: (statement: string) => Promise<unknown>;
  end: () => Promise<void>;
}

export interface RuntimeRedis {
  readonly isOpen: boolean;
  on: (event: "error", listener: (error: Error) => void) => unknown;
  connect: () => Promise<unknown>;
  ping: () => Promise<unknown>;
  quit: () => Promise<unknown>;
}

export interface RuntimeDependencies {
  createPool: (databaseUrl: string, timeoutMs: number) => RuntimePool;
  createPrisma: (databaseUrl: string) => RuntimePrismaClient;
  createAuthBoundary: (prisma: RuntimePrismaClient, config: AuthConfig) => AuthBoundary | Promise<AuthBoundary>;
  createRedis: (redisUrl: string, timeoutMs: number) => RuntimeRedis;
  createServer: (app: Express) => RunningServer;
}

export interface RunningApi {
  port: number;
  shutdown: () => Promise<void>;
}

const defaultDependencies: RuntimeDependencies = {
  createPool: (databaseUrl, timeoutMs) => new Pool({ connectionString: databaseUrl, connectionTimeoutMillis: timeoutMs }),
  createPrisma: createPrismaClient,
  createAuthBoundary,
  createRedis: (redisUrl, timeoutMs) => createClient({ url: redisUrl, socket: { connectTimeout: timeoutMs } }),
  createServer: createAppServer
};

export async function startApi(
  environment: NodeJS.ProcessEnv,
  dependencies: RuntimeDependencies = defaultDependencies
): Promise<RunningApi> {
  const config = loadConfig(environment);
  let pool: RuntimePool | undefined;
  let prisma: RuntimePrismaClient | undefined;
  let redis: RuntimeRedis | undefined;
  let server: RunningServer | undefined;
  let shutdownPromise: Promise<void> | undefined;

  const shutdown = (): Promise<void> => {
    shutdownPromise ??= (async () => {
      const closers: Promise<unknown>[] = [];
      if (server) closers.push(server.close());
      if (redis?.isOpen) closers.push(redis.quit());
      if (prisma) closers.push(prisma.$disconnect());
      if (pool) closers.push(pool.end());
      const results = await Promise.allSettled(closers);
      const failures = results.filter((result) => result.status === "rejected");
      if (failures.length) throw new AggregateError(failures, "API resource cleanup failed");
    })();
    return shutdownPromise;
  };

  try {
    pool = dependencies.createPool(config.databaseUrl, config.readinessTimeoutMs);
    prisma = dependencies.createPrisma(config.databaseUrl);
    await prisma.$connect();
    redis = dependencies.createRedis(config.redisUrl, config.readinessTimeoutMs);
    redis.on("error", () => undefined);
    await redis.connect();
    const auth = await dependencies.createAuthBoundary(prisma, config.auth);
    const app = createApp({
      auth,
      probes: createProbeDependencies(pool, redis),
      readinessTimeoutMs: config.readinessTimeoutMs,
      rooms: createRoomListService(createPrismaRoomReadRepository(prisma))
    });
    server = dependencies.createServer(app);
    const port = await server.listen(config.port);
    return { port, shutdown };
  } catch (startupError) {
    try {
      await shutdown();
    } catch (cleanupError) {
      throw new AggregateError([startupError, cleanupError], "API startup failed and resource cleanup was incomplete");
    }
    throw startupError;
  }
}
