import { loadConfig } from "./config.js";

describe("loadConfig", () => {
  const valid = {
    PORT: "4000", DATABASE_URL: "postgresql://dummy:dummy@postgres:5432/dummy",
    REDIS_URL: "redis://redis:6379", READINESS_TIMEOUT_MS: "250",
    BETTER_AUTH_SECRET: "dummy-secret-with-at-least-32-characters",
    BETTER_AUTH_URL: "http://127.0.0.1:8081",
    BETTER_AUTH_TRUSTED_ORIGINS: "http://127.0.0.1:8081,http://127.0.0.1:3000",
    GOOGLE_CLIENT_ID: "dummy-google-client-id",
    GOOGLE_CLIENT_SECRET: "dummy-google-client-secret"
  };
  it("returns validated configuration", () => {
    expect(loadConfig(valid)).toEqual({
      port: 4000,
      databaseUrl: valid.DATABASE_URL,
      redisUrl: valid.REDIS_URL,
      readinessTimeoutMs: 250,
      auth: {
        secret: valid.BETTER_AUTH_SECRET,
        baseUrl: valid.BETTER_AUTH_URL,
        trustedOrigins: ["http://127.0.0.1:8081", "http://127.0.0.1:3000"],
        googleClientId: valid.GOOGLE_CLIENT_ID,
        googleClientSecret: valid.GOOGLE_CLIENT_SECRET
      }
    });
  });
  it("fails with field names but not secret values", () => {
    expect.assertions(2);
    const secret = "do-not-leak";
    try { loadConfig({ ...valid, DATABASE_URL: secret }); } catch (error) {
      expect((error as Error).message).toContain("DATABASE_URL");
      expect((error as Error).message).not.toContain(secret);
    }
  });
  it.each([
    "BETTER_AUTH_SECRET",
    "BETTER_AUTH_URL",
    "BETTER_AUTH_TRUSTED_ORIGINS",
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET"
  ])("requires %s without disclosing other auth values", (field) => {
    const environment = { ...valid, [field]: "" };
    expect(() => loadConfig(environment)).toThrow(field);
    try { loadConfig(environment); } catch (error) {
      expect((error as Error).message).not.toContain(valid.GOOGLE_CLIENT_SECRET);
      expect((error as Error).message).not.toContain(valid.BETTER_AUTH_SECRET);
    }
  });
  it.each([
    ["BETTER_AUTH_URL", "https://example.com/path"],
    ["BETTER_AUTH_URL", "https://example.com/"],
    ["BETTER_AUTH_TRUSTED_ORIGINS", "https://example.com/path"],
    ["BETTER_AUTH_TRUSTED_ORIGINS", "http://127.0.0.1:8081,http://127.0.0.1:8081"],
    ["BETTER_AUTH_TRUSTED_ORIGINS", "http://127.0.0.1:3000"],
    ["GOOGLE_CLIENT_ID", " "],
    ["GOOGLE_CLIENT_SECRET", " dummy-secret-with-padding "]
  ])("rejects non-canonical or unsafe %s values", (field, value) => {
    expect(() => loadConfig({ ...valid, [field]: value })).toThrow(`Invalid startup configuration: ${field}`);
  });
});
