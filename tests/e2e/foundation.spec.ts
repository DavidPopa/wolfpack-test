import { createRequire } from "node:module";
import { expect, test } from "@playwright/test";
import { interceptStadiaTiles } from "./map-network";

const require = createRequire(import.meta.url);
const socketClientPath = require.resolve("socket.io-client/dist/socket.io.js");

test.beforeEach(async ({ page }) => {
  await interceptStadiaTiles(page);
});

test("production page and API are available through the proxy", async ({ page, request, baseURL }) => {
  const sessionRequest = page.waitForResponse((response) => response.url().endsWith("/api/auth/get-session"));
  await page.goto("/");
  const sessionResponse = await sessionRequest;
  expect(sessionResponse.status()).toBe(200);
  expect(await sessionResponse.json()).toBeNull();
  await expect(page.getByRole("heading", { name: "Explore rooms around you." })).toBeVisible();
  await expect(page.getByText("Signed out")).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
  await expect(page.getByRole("button", { name: /password|github|apple/i })).toHaveCount(0);
  const health = await request.get("/api/health");
  expect(health.status()).toBe(200);
  expect(await health.json()).toEqual({ status: "ok", service: "api" });
  const missing = await request.get("/api/unknown-foundation-route");
  expect(missing.status()).toBe(404);
  expect(missing.headers()["content-type"]).toContain("application/json");
  expect(await missing.json()).toEqual({ error: { code: "NOT_FOUND", message: "Route not found" } });

  const anonymousSession = await request.get("/api/auth/get-session");
  expect(anonymousSession.status()).toBe(200);
  expect(await anonymousSession.json()).toBeNull();

  const passwordSignUp = await request.post("/api/auth/sign-up/email", {
    headers: { origin: baseURL ?? "" },
    data: { name: "Test User", email: "test@example.invalid", password: "not-a-real-password" }
  });
  expect(passwordSignUp.status()).toBe(400);
  expect(await passwordSignUp.json()).toEqual({
    message: "Email and password sign up is not enabled",
    code: "EMAIL_PASSWORD_SIGN_UP_DISABLED"
  });
});

test("guest map shell and authentication remain usable at a mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const heading = page.getByRole("heading", { name: "Explore rooms around you." });
  const signIn = page.getByRole("button", { name: "Continue with Google" });
  await expect(heading).toBeVisible();
  await signIn.scrollIntoViewIfNeeded();
  await expect(signIn).toBeVisible();
  await expect(signIn).toBeInViewport();
});

for (const transport of ["polling", "websocket"] as const) {
  test(`Socket.IO ${transport} reaches Express through the proxy`, async ({ page }) => {
    await page.goto("/");
    await page.addScriptTag({ path: socketClientPath });
    const connectedTransport = await page.evaluate(async (selectedTransport) => {
      const io = (window as typeof window & { io: (options: object) => { io: { engine: { transport: { name: string } } }; on: (event: string, listener: (...args: unknown[]) => void) => void; disconnect: () => void } }).io;
      const socket = io({ path: "/socket.io", transports: [selectedTransport], forceNew: true, reconnection: false });
      return await new Promise<string>((resolve, reject) => {
        socket.on("connect", () => { const name = socket.io.engine.transport.name; socket.disconnect(); resolve(name); });
        socket.on("connect_error", () => reject(new Error("socket connection failed")));
      });
    }, transport);
    expect(connectedTransport).toBe(transport);
  });
}
