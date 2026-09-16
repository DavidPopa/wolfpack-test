import type { ReadinessResponse } from "@map-chat/contracts";
export interface ProbeDependencies { postgres: () => Promise<unknown>; redis: () => Promise<unknown> }
export interface PostgresProbeClient { query: (statement: string) => Promise<unknown> }

function withTimeout(operation: Promise<unknown>, timeoutMs: number): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("probe timeout")), timeoutMs);
    operation.then(
      (value) => { clearTimeout(timer); resolve(value); },
      () => { clearTimeout(timer); reject(new Error("probe failed")); }
    );
  });
}

export async function checkReadiness(dependencies: ProbeDependencies, timeoutMs: number): Promise<ReadinessResponse> {
  const [postgres, redis] = await Promise.allSettled([
    withTimeout(dependencies.postgres(), timeoutMs), withTimeout(dependencies.redis(), timeoutMs)
  ]);
  const statuses = {
    postgres: postgres.status === "fulfilled" ? "up" : "down",
    redis: redis.status === "fulfilled" ? "up" : "down"
  } as const;
  return { status: statuses.postgres === "up" && statuses.redis === "up" ? "ready" : "not_ready", dependencies: statuses };
}

export function createProbeDependencies(pool: PostgresProbeClient, redisClient: { ping: () => Promise<unknown> }): ProbeDependencies {
  return { postgres: () => pool.query("SELECT 1"), redis: () => redisClient.ping() };
}
