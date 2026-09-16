import { createRequire } from "node:module";
import { expect, test } from "@playwright/test";

const require = createRequire(import.meta.url);
const socketClientPath = require.resolve("socket.io-client/dist/socket.io.js");

test("production page and API are available through the proxy", async ({ page, request, baseURL }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Foundation is running" })).toBeVisible();
  await expect(page.getByRole("status")).toContainText("API status: ok");
  await expect(page.getByRole("button", { name: "Retry health check" })).toHaveCount(0);
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
