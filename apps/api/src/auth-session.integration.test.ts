import { randomUUID } from "node:crypto";
import type { BetterAuthPlugin } from "better-auth";
import type { TestHelpers } from "better-auth/plugins";
import request from "supertest";
import { createApp } from "./app.js";
import { buildAuthOptions, createAuthBoundary } from "./auth.js";
import type { AuthConfig } from "./config.js";
import { createPrismaClient } from "./prisma.js";
import { createPrismaRoomReadRepository } from "./rooms/repository.js";
import { createRoomListService } from "./rooms/service.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("TEST_DATABASE_URL is required for persistent auth session integration tests");

const authConfig: AuthConfig = {
  secret: "task-002b-dummy-secret-value-with-sufficient-length-and-variety",
  baseUrl: "http://127.0.0.1:8081",
  trustedOrigins: ["http://127.0.0.1:8081"],
  googleClientId: "dummy-google-client-id",
  googleClientSecret: "dummy-google-client-secret"
};

describe("persistent Better Auth sessions", () => {
  const prisma = createPrismaClient(databaseUrl);
  const ownedUserIds: string[] = [];

  beforeAll(async () => prisma.$connect());
  afterEach(async () => {
    const userIds = ownedUserIds.splice(0);
    if (!userIds.length) return;
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    expect(await prisma.user.count({ where: { id: { in: userIds } } })).toBe(0);
    expect(await prisma.account.count({ where: { userId: { in: userIds } } })).toBe(0);
    expect(await prisma.session.count({ where: { userId: { in: userIds } } })).toBe(0);
  });
  afterAll(async () => prisma.$disconnect());

  it("resolves a persisted session and invalidates it only for a trusted-origin logout", async () => {
    const fixtureId = `task002b-${randomUUID()}`;
    const userId = `${fixtureId}-user`;
    ownedUserIds.push(userId);

    const [{ betterAuth }, { prismaAdapter }, { testUtils }, auth] = await Promise.all([
      import("better-auth"),
      import("@better-auth/prisma-adapter"),
      import("better-auth/plugins"),
      createAuthBoundary(prisma, authConfig)
    ]);
    // The privileged helper exists only on this test-constructed auth instance. It registers no HTTP routes.
    const fixtureAuth = betterAuth({
      ...buildAuthOptions(prisma, authConfig, prismaAdapter),
      // Better Auth 1.7.5's plugin declaration conflicts with exactOptionalPropertyTypes at this boundary.
      plugins: [testUtils() as unknown as BetterAuthPlugin]
    });
    const fixtureContext = await fixtureAuth.$context;
    const fixtureHelpers = (fixtureContext as typeof fixtureContext & { test: TestHelpers }).test;
    const fixtureUser = fixtureHelpers.createUser({
      id: userId,
      name: "Task 002B Fixture",
      email: `${fixtureId}@example.invalid`,
      emailVerified: true
    });
    await fixtureHelpers.saveUser(fixtureUser);
    await prisma.account.create({
      data: { id: `${fixtureId}-account`, accountId: fixtureId, providerId: "google", userId }
    });
    const login = await fixtureHelpers.login({ userId });
    const cookie = login.headers.get("cookie");
    if (!cookie) throw new Error("Better Auth test construction did not create a session cookie");
    const app = createApp({
      auth,
      probes: { postgres: async () => true, redis: async () => true },
      readinessTimeoutMs: 100,
      rooms: createRoomListService(createPrismaRoomReadRepository(prisma)),
      roomCreation: { createRoom: async () => ({ status: "unavailable" }) }
    });

    await expect(app.resolveIdentity({ headers: { cookie } })).resolves.toEqual({ userId });
    expect(await prisma.account.count({ where: { userId, providerId: "google" } })).toBe(1);
    expect(await prisma.session.count({ where: { userId } })).toBe(1);

    await request(app)
      .post("/api/auth/sign-out")
      .set("cookie", cookie)
      .set("origin", "https://untrusted.example")
      .send({})
      .expect(403);
    expect(await prisma.session.count({ where: { userId } })).toBe(1);

    const logoutResponse = await request(app)
      .post("/api/auth/sign-out")
      .set("cookie", cookie)
      .set("origin", authConfig.baseUrl)
      .send({})
      .expect(200, { success: true });
    const clearedCookies = logoutResponse.headers["set-cookie"];
    const clearedCookieHeader = Array.isArray(clearedCookies) ? clearedCookies.join("; ") : String(clearedCookies);
    expect(clearedCookieHeader).toMatch(/better-auth\.session_token=;/);
    expect(clearedCookieHeader).toMatch(/Max-Age=0/i);
    expect(clearedCookieHeader).toMatch(/HttpOnly/i);
    expect(clearedCookieHeader).toMatch(/SameSite=Lax/i);

    expect(await prisma.session.count({ where: { userId } })).toBe(0);
    expect(await prisma.account.count({ where: { userId, providerId: "google" } })).toBe(1);
    await expect(app.resolveIdentity({ headers: { cookie } })).resolves.toBeNull();
    await request(app).get("/api/auth/get-session").set("cookie", cookie).expect(200, null);
  });
});
