import { loadConfig } from "./config.js";

describe("loadConfig", () => {
  const valid = {
    PORT: "4000", DATABASE_URL: "postgresql://dummy:dummy@postgres:5432/dummy",
    REDIS_URL: "redis://redis:6379", READINESS_TIMEOUT_MS: "250"
  };
  it("returns validated configuration", () => {
    expect(loadConfig(valid)).toEqual({ port: 4000, databaseUrl: valid.DATABASE_URL, redisUrl: valid.REDIS_URL, readinessTimeoutMs: 250 });
  });
  it("fails with field names but not secret values", () => {
    expect.assertions(2);
    const secret = "do-not-leak";
    try { loadConfig({ ...valid, DATABASE_URL: secret }); } catch (error) {
      expect((error as Error).message).toContain("DATABASE_URL");
      expect((error as Error).message).not.toContain(secret);
    }
  });
});
