import type { RequestHandler } from "express";
import request from "supertest";
import type { AuthBoundary } from "./auth.js";
import { createApp } from "./app.js";

const passingProbes = { postgres: async () => true, redis: async () => true };
const unavailableAuthHandler: RequestHandler = (_request, response) => {
  response.status(503).json({ error: { code: "AUTH_TEST_HANDLER", message: "Test handler only" } });
};

function createTestAuth(handler: RequestHandler = unavailableAuthHandler): AuthBoundary {
  return { handler, resolveIdentity: async () => null };
}

function createTestApp(authHandler: RequestHandler = unavailableAuthHandler) {
  return createApp({ auth: createTestAuth(authHandler), probes: passingProbes, readinessTimeoutMs: 50 });
}

describe("infrastructure routes", () => {
  it("serves health independently of dependencies", async () => {
    const app = createApp({
      auth: createTestAuth(),
      probes: { postgres: async () => Promise.reject(), redis: async () => Promise.reject() },
      readinessTimeoutMs: 50
    });
    await request(app).get("/api/health").expect(200, { status: "ok", service: "api" });
  });
  it("aggregates readiness success", async () => {
    await request(createTestApp()).get("/api/ready").expect(200, {
      status: "ready", dependencies: { postgres: "up", redis: "up" }
    });
  });
  it("returns a redacted failure and bounds a hanging probe", async () => {
    const app = createApp({
      auth: createTestAuth(),
      probes: { postgres: async () => new Promise(() => undefined), redis: async () => true },
      readinessTimeoutMs: 50
    });
    const started = Date.now();
    const response = await request(app).get("/api/ready").expect(503);
    expect(Date.now() - started).toBeLessThan(500);
    expect(response.body).toEqual({ status: "not_ready", dependencies: { postgres: "down", redis: "up" } });
    expect(JSON.stringify(response.body)).not.toMatch(/timeout|error|postgresql:\/\//i);
  });
  it("returns JSON for unknown API routes", async () => {
    await request(createTestApp()).get("/api/missing")
      .expect("content-type", /json/).expect(404, { error: { code: "NOT_FOUND", message: "Route not found" } });
  });
  it("mounts the auth catch-all before JSON parsing", async () => {
    const authHandler: RequestHandler = jest.fn((_request, response) => response.status(204).end());
    await request(createTestApp(authHandler))
      .post("/api/auth/test-route")
      .set("content-type", "application/json")
      .send("{")
      .expect(204);
    expect(authHandler).toHaveBeenCalledTimes(1);
  });
  it("keeps JSON parsing after the auth boundary", async () => {
    await request(createTestApp())
      .post("/api/missing")
      .set("content-type", "application/json")
      .send("{")
      .expect(400);
  });
  it("accepts a session resolver only as an application construction dependency", async () => {
    const resolveIdentity = jest.fn(async () => ({ userId: "fixture-user" }));
    const app = createApp({
      auth: { handler: unavailableAuthHandler, resolveIdentity },
      probes: passingProbes,
      readinessTimeoutMs: 50
    });

    await expect(app.resolveIdentity({ headers: { cookie: "fixture-cookie" } })).resolves.toEqual({
      userId: "fixture-user"
    });
    expect(resolveIdentity).toHaveBeenCalledWith({ headers: { cookie: "fixture-cookie" } });
  });
  it("does not expose a fixture route or activate identity from request headers", async () => {
    const resolveIdentity = jest.fn(async () => ({ userId: "fixture-user" }));
    const app = createApp({
      auth: { handler: unavailableAuthHandler, resolveIdentity },
      probes: passingProbes,
      readinessTimeoutMs: 50
    });

    await request(app)
      .get("/api/test-session")
      .set("x-test-user", "fixture-user")
      .set("authorization", "Bearer fixture-token")
      .expect(404, { error: { code: "NOT_FOUND", message: "Route not found" } });
    expect(resolveIdentity).not.toHaveBeenCalled();
  });
});
