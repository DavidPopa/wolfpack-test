import { createHash } from "node:crypto";

export const RATE_LIMIT_ACTIONS = ["room", "message"] as const;

export type RateLimitAction = (typeof RATE_LIMIT_ACTIONS)[number];

export interface RateLimitPolicy {
  limit: number;
  windowSeconds: number;
}

export interface WriteRateLimitConfig {
  keyPrefix: string;
  policies: Record<RateLimitAction, RateLimitPolicy>;
}

export type WriteRateLimitResult =
  | { status: "allowed"; remaining: number }
  | { status: "exceeded"; retryAfterSeconds: number }
  | { status: "unavailable"; retryable: true };

export interface AtomicRateLimitRedis {
  eval: (
    script: string,
    options: { keys: string[]; arguments: string[] }
  ) => Promise<unknown>;
}

export interface WriteRateLimiter {
  consume: (action: RateLimitAction, identifier: string) => Promise<WriteRateLimitResult>;
}

const incrementWithExpiryScript = `
local count = redis.call("INCR", KEYS[1])
local pttl = redis.call("PTTL", KEYS[1])
if pttl == -1 then
  redis.call("PEXPIRE", KEYS[1], ARGV[1])
  pttl = redis.call("PTTL", KEYS[1])
end
return { count, pttl }
`;

const validKeyPrefix = /^[a-z0-9:_-]{1,64}$/;

export function deriveRateLimitKey(
  keyPrefix: string,
  action: RateLimitAction,
  identifier: string
): string {
  if (!validKeyPrefix.test(keyPrefix)) {
    throw new Error("Invalid rate-limit key prefix");
  }
  const identifierHash = createHash("sha256").update(identifier).digest("hex");
  return `${keyPrefix}:${action}:${identifierHash}`;
}

function parseAtomicReply(reply: unknown): { count: number; pttlMilliseconds: number } | undefined {
  if (
    !Array.isArray(reply) ||
    reply.length !== 2 ||
    !Number.isSafeInteger(reply[0]) ||
    !Number.isSafeInteger(reply[1]) ||
    reply[0] <= 0 ||
    reply[1] <= 0
  ) {
    return undefined;
  }

  return { count: reply[0], pttlMilliseconds: reply[1] };
}

export function createWriteRateLimiter(
  redis: AtomicRateLimitRedis,
  config: WriteRateLimitConfig
): WriteRateLimiter {
  return {
    consume: async (action, identifier) => {
      try {
        const policy = config.policies[action];
        const reply = await redis.eval(incrementWithExpiryScript, {
          keys: [deriveRateLimitKey(config.keyPrefix, action, identifier)],
          arguments: [String(policy.windowSeconds * 1000)]
        });
        const parsed = parseAtomicReply(reply);
        if (!parsed) return { status: "unavailable", retryable: true };
        if (parsed.count > policy.limit) {
          return {
            status: "exceeded",
            retryAfterSeconds: Math.ceil(parsed.pttlMilliseconds / 1000)
          };
        }
        return { status: "allowed", remaining: policy.limit - parsed.count };
      } catch {
        return { status: "unavailable", retryable: true };
      }
    }
  };
}
