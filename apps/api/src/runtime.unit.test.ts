import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { startApi, type RuntimePool, type RuntimeRedis } from "./runtime.js";
import { createAppServer } from "./server.js";

const validEnvironment = {
  PORT: "4000",
  DATABASE_URL: "postgresql://dummy:dummy@127.0.0.1:5432/dummy",
  REDIS_URL: "redis://127.0.0.1:6379",
  READINESS_TIMEOUT_MS: "250"
};

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
      { createPool: () => pool, createRedis: () => redis, createServer: createAppServer }
    );
    void startup.then((running) => { unexpectedlyRunning = running; }, () => undefined);
    await expect(startup).rejects.toMatchObject({ code: "EADDRINUSE" });
    expect(redis.quit).toHaveBeenCalledTimes(1);
    expect(pool.end).toHaveBeenCalledTimes(1);
    expect(redis.isOpen).toBe(false);
  } finally {
    await unexpectedlyRunning?.shutdown();
    await new Promise<void>((resolve, reject) => blocker.close((error) => error ? reject(error) : resolve()));
  }
}, 2_000);
