import { buildAuthOptions, createSessionResolver } from "./auth.js";
import type { AuthConfig } from "./config.js";
import type { RuntimePrismaClient } from "./prisma.js";

const authConfig: AuthConfig = {
  secret: "task-002a-dummy-secret-value-with-sufficient-length-and-variety",
  baseUrl: "http://127.0.0.1:8081",
  trustedOrigins: ["http://127.0.0.1:8081"],
  googleClientId: "dummy-google-client-id",
  googleClientSecret: "dummy-google-client-secret"
};

const prisma: RuntimePrismaClient = {
  $connect: async () => undefined,
  $disconnect: async () => undefined,
  room: { findMany: async () => [] }
};

describe("Google-only Better Auth configuration", () => {
  it("builds the Prisma-backed options with Google as the sole provider", () => {
    const database = jest.fn();
    const createDatabase = jest.fn(() => database);
    const options = buildAuthOptions(prisma, authConfig, createDatabase as never);

    expect(createDatabase).toHaveBeenCalledWith(prisma, { provider: "postgresql" });
    expect(options.database).toBe(database);
    expect(options.baseURL).toBe(authConfig.baseUrl);
    expect(options.basePath).toBe("/api/auth");
    expect(options.secret).toBe(authConfig.secret);
    expect(options.trustedOrigins).toEqual(authConfig.trustedOrigins);
    expect(Object.keys(options.socialProviders ?? {})).toEqual(["google"]);
    expect(options.socialProviders?.google).toEqual({
      clientId: authConfig.googleClientId,
      clientSecret: authConfig.googleClientSecret
    });
    expect(options.socialProviders?.google).not.toHaveProperty("hd");
    expect(options.emailAndPassword).toBeUndefined();
    expect(options.advanced?.useSecureCookies).toBe(false);

    const secureOptions = buildAuthOptions(
      prisma,
      { ...authConfig, baseUrl: "https://chat.example", trustedOrigins: ["https://chat.example"] },
      createDatabase as never
    );
    expect(secureOptions.advanced?.useSecureCookies).toBe(true);
  });
});

describe("authenticated identity resolver", () => {
  it("derives identity only from a verified header session", async () => {
    const verifySession = jest.fn(async () => ({ user: { id: "verified-user-id" } }));
    const resolveIdentity = createSessionResolver(verifySession);
    const request = {
      headers: { cookie: "opaque-session-cookie", "x-user-id": "spoofed-header-id" },
      body: { userId: "spoofed-payload-id" }
    };

    await expect(resolveIdentity(request)).resolves.toEqual({ userId: "verified-user-id" });
    expect(verifySession).toHaveBeenCalledWith(request.headers);
    expect(verifySession).toHaveBeenCalledTimes(1);
  });

  it("returns no identity when Better Auth verifies no session", async () => {
    const resolveIdentity = createSessionResolver(async () => null);
    await expect(resolveIdentity({ headers: {} })).resolves.toBeNull();
  });
});
