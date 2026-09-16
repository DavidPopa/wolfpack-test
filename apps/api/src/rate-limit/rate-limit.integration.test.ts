import { randomUUID } from "node:crypto";
import { createClient } from "redis";
import {
  createWriteRateLimiter,
  deriveRateLimitKey,
  type RateLimitPolicy,
  type WriteRateLimitConfig
} from "./index.js";

const redisUrl = process.env.TEST_REDIS_URL;
const testKeyPrefix = process.env.TEST_REDIS_KEY_PREFIX;
if (!redisUrl || !testKeyPrefix?.startsWith("foundation:task001:")) {
  throw new Error("TEST_REDIS_URL and an isolated foundation:task001: key prefix are required");
}

describe("write rate limiter with real Redis", () => {
  const redis = createClient({ url: redisUrl, socket: { connectTimeout: 1000 } });
  const runPrefix = `${testKeyPrefix}rl:${randomUUID().replaceAll("-", "").slice(0, 12)}`;
  const ownedKeys = new Set<string>();

  function createFixture(policy: RateLimitPolicy, identifier: string) {
    const config: WriteRateLimitConfig = {
      keyPrefix: runPrefix,
      policies: { room: policy, message: policy }
    };
    const key = deriveRateLimitKey(runPrefix, "room", identifier);
    ownedKeys.add(key);
    return { key, limiter: createWriteRateLimiter(redis, config) };
  }

  beforeAll(async () => redis.connect());
  afterEach(async () => {
    const keys = [...ownedKeys];
    if (keys.length) {
      await redis.del(keys);
      expect(await redis.exists(keys)).toBe(0);
    }
    ownedKeys.clear();
  });
  afterAll(async () => redis.quit());

  it("serializes concurrent increments with a positive expiry", async () => {
    const { key, limiter } = createFixture({ limit: 20, windowSeconds: 10 }, "concurrent-fixture");

    const results = await Promise.all(
      Array.from({ length: 25 }, () => limiter.consume("room", "concurrent-fixture"))
    );

    const allowed = results.filter((result) => result.status === "allowed");
    const exceeded = results.filter((result) => result.status === "exceeded");
    expect(allowed).toHaveLength(20);
    expect(exceeded).toHaveLength(5);
    expect(allowed.map((result) => result.status === "allowed" ? result.remaining : -1).sort((a, b) => a - b))
      .toEqual(Array.from({ length: 20 }, (_, index) => index));
    expect(exceeded.every((result) => result.status === "exceeded" && result.retryAfterSeconds > 0)).toBe(true);
    expect(await redis.get(key)).toBe("25");
    expect(await redis.ttl(key)).toBeGreaterThan(0);
  });

  it("self-heals an owned counter that has no expiry", async () => {
    const { key, limiter } = createFixture({ limit: 5, windowSeconds: 30 }, "self-heal-fixture");
    await redis.set(key, "4");
    expect(await redis.ttl(key)).toBe(-1);

    await expect(limiter.consume("room", "self-heal-fixture")).resolves.toEqual({
      status: "allowed",
      remaining: 0
    });
    const ttl = await redis.ttl(key);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(30);
  });

  it("recreates an expired counter as a fresh window", async () => {
    const { key, limiter } = createFixture({ limit: 1, windowSeconds: 10 }, "expiry-fixture");
    await expect(limiter.consume("room", "expiry-fixture")).resolves.toEqual({
      status: "allowed",
      remaining: 0
    });
    await expect(limiter.consume("room", "expiry-fixture")).resolves.toMatchObject({ status: "exceeded" });

    await redis.pExpire(key, 20);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(await redis.exists(key)).toBe(0);
    await expect(limiter.consume("room", "expiry-fixture")).resolves.toEqual({
      status: "allowed",
      remaining: 0
    });
    expect(await redis.get(key)).toBe("1");
    expect(await redis.ttl(key)).toBeGreaterThan(0);
  });

  it("preserves a live sub-second expiry and rounds retry timing up", async () => {
    const { key, limiter } = createFixture({ limit: 1, windowSeconds: 10 }, "subsecond-fixture");
    await expect(limiter.consume("room", "subsecond-fixture")).resolves.toEqual({
      status: "allowed",
      remaining: 0
    });
    await redis.pExpire(key, 250);
    expect(await redis.pTTL(key)).toBeGreaterThan(0);

    await expect(limiter.consume("room", "subsecond-fixture")).resolves.toEqual({
      status: "exceeded",
      retryAfterSeconds: 1
    });
    const remainingMilliseconds = await redis.pTTL(key);
    expect(remainingMilliseconds).toBeGreaterThan(0);
    expect(remainingMilliseconds).toBeLessThan(1000);
  });
});
