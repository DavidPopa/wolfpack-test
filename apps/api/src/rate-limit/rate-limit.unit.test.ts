import { createHash } from "node:crypto";
import {
  createWriteRateLimiter,
  deriveRateLimitKey,
  type AtomicRateLimitRedis,
  type WriteRateLimitConfig
} from "./index.js";

const config: WriteRateLimitConfig = {
  keyPrefix: "mapchat:test",
  policies: {
    room: { limit: 5, windowSeconds: 60 },
    message: { limit: 30, windowSeconds: 45 }
  }
};

interface EvalCall {
  script: string;
  options: { keys: string[]; arguments: string[] };
}

function redisReturning(reply: unknown): { redis: AtomicRateLimitRedis; calls: EvalCall[] } {
  const calls: EvalCall[] = [];
  return {
    redis: {
      eval: async (script, options) => {
        calls.push({ script, options });
        return reply;
      }
    },
    calls
  };
}

describe("write rate limiter", () => {
  it("derives a bounded deterministic key without exposing the identifier", () => {
    const identifier = "private-identifier";
    const digest = createHash("sha256").update(identifier).digest("hex");

    const first = deriveRateLimitKey(config.keyPrefix, "room", identifier);
    const second = deriveRateLimitKey(config.keyPrefix, "room", identifier);

    expect(first).toBe(`mapchat:test:room:${digest}`);
    expect(second).toBe(first);
    expect(first).not.toContain(identifier);
    expect(first).toHaveLength(config.keyPrefix.length + 1 + "room".length + 1 + 64);
  });

  it.each(["Uppercase", "invalid space", "a".repeat(65)])(
    "rejects an invalid key prefix before deriving a key",
    (keyPrefix) => {
      expect(() => deriveRateLimitKey(keyPrefix, "room", "private-identifier")).toThrow(
        "Invalid rate-limit key prefix"
      );
    }
  );

  it("uses one atomic Redis evaluation and allows exactly through the threshold", async () => {
    const { redis, calls } = redisReturning([5, 17_000]);
    const limiter = createWriteRateLimiter(redis, config);

    await expect(limiter.consume("room", "user-1")).resolves.toEqual({
      status: "allowed",
      remaining: 0
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.options).toEqual({
      keys: [deriveRateLimitKey(config.keyPrefix, "room", "user-1")],
      arguments: ["60000"]
    });
    expect(calls[0]?.script).toContain('redis.call("INCR"');
    expect(calls[0]?.script).toContain('redis.call("PEXPIRE"');
    expect(calls[0]?.script).toContain('redis.call("PTTL"');
    expect(calls[0]?.script).toContain("if pttl == -1 then");
    expect(calls[0]?.script).not.toContain('redis.call("EXPIRE"');
    expect(calls[0]?.script).not.toContain('redis.call("TTL"');
  });

  it.each([
    [9_000, 9],
    [250, 1]
  ])("rounds a positive PTTL of %i ms up to a %i-second retry delay", async (pttl, retryAfterSeconds) => {
    const limiter = createWriteRateLimiter(redisReturning([31, pttl]).redis, config);

    await expect(limiter.consume("message", "user-2")).resolves.toEqual({
      status: "exceeded",
      retryAfterSeconds
    });
  });

  it.each([
    null,
    [1],
    [1, 2, 3],
    ["1", 2],
    [1, "2"],
    [0, 2],
    [1, 0],
    [1, -1],
    [1, -2],
    [1, 1.5],
    [Number.MAX_SAFE_INTEGER + 1, 2]
  ])("fails closed for malformed atomic reply %#", async (reply) => {
    const limiter = createWriteRateLimiter(redisReturning(reply).redis, config);

    await expect(limiter.consume("room", "user-3")).resolves.toEqual({
      status: "unavailable",
      retryable: true
    });
  });

  it("fails closed without exposing Redis errors", async () => {
    const redis: AtomicRateLimitRedis = {
      eval: async () => { throw new Error("provider connection details"); }
    };
    const limiter = createWriteRateLimiter(redis, config);

    await expect(limiter.consume("room", "user-4")).resolves.toEqual({
      status: "unavailable",
      retryable: true
    });
  });
});
