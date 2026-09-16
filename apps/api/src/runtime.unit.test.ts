import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import type { RequestHandler } from "express";
import { startApi, type RuntimePool, type RuntimeRedis } from "./runtime.js";
import type { AuthBoundary } from "./auth.js";
import type { RuntimePrismaClient } from "./prisma.js";
import { createAppServer, type RunningServer } from "./server.js";

const validEnvironment = {
  PORT: "4000",
  DATABASE_URL: "postgresql://dummy:dummy@127.0.0.1:5432/dummy",
  REDIS_URL: "redis://127.0.0.1:6379",
  READINESS_TIMEOUT_MS: "250",
  BETTER_AUTH_SECRET: "task-002a-dummy-secret-value-with-sufficient-length-and-variety",
  BETTER_AUTH_URL: "http://127.0.0.1:8081",
  BETTER_AUTH_TRUSTED_ORIGINS: "http://127.0.0.1:8081",
  GOOGLE_CLIENT_ID: "dummy-google-client-id",
  GOOGLE_CLIENT_SECRET: "dummy-google-client-secret"
};

const authHandler: RequestHandler = (_request, response) => response.status(404).end();
const auth: AuthBoundary = { handler: authHandler, resolveIdentity: async () => null };

it("creates one Prisma client from the validated URL and disconnects it on shutdown", async () => {
  const pool: RuntimePool = { query: jest.fn(async () => undefined), end: jest.fn(async () => undefined) };
  const prisma: RuntimePrismaClient = {
    $connect: jest.fn(async () => undefined),
    $disconnect: jest.fn(async () => undefined)
  };
  let redisOpen = false;
  const redis: RuntimeRedis = {
    get isOpen() { return redisOpen; },
    on: jest.fn(),
    connect: jest.fn(async () => { redisOpen = true; }),
    ping: jest.fn(async () => "PONG"),
    quit: jest.fn(async () => { redisOpen = false; })
  };
  const runningServer: RunningServer = {
    httpServer: undefined as never,
    io: undefined as never,
    listen: jest.fn(async () => 4000),
    close: jest.fn(async () => undefined)
  };
  const createPrisma = jest.fn(() => prisma);
  const createAuthBoundary = jest.fn(() => auth);

  const running = await startApi(validEnvironment, {
    createPool: () => pool,
    createPrisma,
    createAuthBoundary,
    createRedis: () => redis,
    createServer: () => runningServer
  });
  await running.shutdown();
  await running.shutdown();

  expect(createPrisma).toHaveBeenCalledTimes(1);
  expect(createPrisma).toHaveBeenCalledWith(validEnvironment.DATABASE_URL);
  expect(createAuthBoundary).toHaveBeenCalledTimes(1);
  expect(createAuthBoundary).toHaveBeenCalledWith(prisma, {
    secret: validEnvironment.BETTER_AUTH_SECRET,
    baseUrl: validEnvironment.BETTER_AUTH_URL,
    trustedOrigins: [validEnvironment.BETTER_AUTH_URL],
    googleClientId: validEnvironment.GOOGLE_CLIENT_ID,
    googleClientSecret: validEnvironment.GOOGLE_CLIENT_SECRET
  });
  expect(prisma.$connect).toHaveBeenCalledTimes(1);
  expect(prisma.$disconnect).toHaveBeenCalledTimes(1);
  expect(runningServer.close).toHaveBeenCalledTimes(1);
  expect(redis.quit).toHaveBeenCalledTimes(1);
  expect(pool.end).toHaveBeenCalledTimes(1);
});

it("closes every acquired resource when the configured port is occupied", async () => {
  const blocker = createServer();
  await new Promise<void>((resolve, reject) => {
    blocker.once("error", reject);
    blocker.listen(0, "0.0.0.0", resolve);
  });
  const port = (blocker.address() as AddressInfo).port;
  const pool: RuntimePool = {
    query: jest.fn(async () => undefined),
    end: jest.fn(async () => undefined)
  };
  const prisma: RuntimePrismaClient = {
    $connect: jest.fn(async () => undefined),
    $disconnect: jest.fn(async () => undefined)
  };
  let redisOpen = false;
  const redis: RuntimeRedis = {
    get isOpen() { return redisOpen; },
    on: jest.fn(),
    connect: jest.fn(async () => { redisOpen = true; }),
    ping: jest.fn(async () => "PONG"),
    quit: jest.fn(async () => { redisOpen = false; })
  };

  let unexpectedlyRunning: Awaited<ReturnType<typeof startApi>> | undefined;
  try {
    const startup = startApi(
      { ...validEnvironment, PORT: String(port) },
      {
        createPool: () => pool,
        createPrisma: () => prisma,
        createAuthBoundary: () => auth,
        createRedis: () => redis,
        createServer: createAppServer
      }
    );
    void startup.then((running) => { unexpectedlyRunning = running; }, () => undefined);
    await expect(startup).rejects.toMatchObject({ code: "EADDRINUSE" });
    expect(redis.quit).toHaveBeenCalledTimes(1);
    expect(prisma.$connect).toHaveBeenCalledTimes(1);
    expect(prisma.$disconnect).toHaveBeenCalledTimes(1);
    expect(pool.end).toHaveBeenCalledTimes(1);
    expect(redis.isOpen).toBe(false);
  } finally {
    await unexpectedlyRunning?.shutdown();
    await new Promise<void>((resolve, reject) => blocker.close((error) => error ? reject(error) : resolve()));
  }
}, 2_000);
