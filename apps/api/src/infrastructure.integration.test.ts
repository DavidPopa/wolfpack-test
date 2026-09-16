import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { createClient } from "redis";
import type { RequestHandler } from "express";
import { io as createSocket, type Socket } from "socket.io-client";
import { createApp } from "./app.js";
import type { AuthBoundary } from "./auth.js";
import { createAppServer } from "./server.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
const redisUrl = process.env.TEST_REDIS_URL;
const keyPrefix = process.env.TEST_REDIS_KEY_PREFIX;
const unusedAuthHandler: RequestHandler = (_request, response) => { response.sendStatus(500); };
const unusedAuth: AuthBoundary = { handler: unusedAuthHandler, resolveIdentity: async () => null };
const unusedRooms = { listPublicRooms: async () => [] };
if (!databaseUrl || !redisUrl || !keyPrefix?.startsWith("foundation:task001:")) {
  throw new Error("TEST_DATABASE_URL, TEST_REDIS_URL, and an isolated foundation:task001: key prefix are required");
}

describe("real infrastructure", () => {
  const pool = new Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 1000 });
  const redis = createClient({ url: redisUrl, socket: { connectTimeout: 1000 } });
  const ownedKeys: string[] = [];
  beforeAll(async () => redis.connect());
  afterAll(async () => {
    if (ownedKeys.length) await redis.del(ownedKeys);
    await redis.quit();
    await pool.end();
  });
  it("performs SQL roundtrip inside a rolled-back fixture transaction", async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("CREATE TEMP TABLE foundation_fixture (value text NOT NULL) ON COMMIT DROP");
      await client.query("INSERT INTO foundation_fixture(value) VALUES ($1)", ["roundtrip"]);
      const result = await client.query<{ value: string }>("SELECT value FROM foundation_fixture");
      expect(result.rows).toEqual([{ value: "roundtrip" }]);
      await client.query("ROLLBACK");
    } finally { client.release(); }
  });
  it("uses an owned Redis key with a short TTL and removes only that key", async () => {
    const key = `${keyPrefix}${randomUUID()}`;
    ownedKeys.push(key);
    await redis.set(key, "fixture", { EX: 5 });
    expect(await redis.get(key)).toBe("fixture");
    const ttl = await redis.ttl(key);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(5);
    await redis.del(key);
    expect(await redis.exists(key)).toBe(0);
  });
  it.each(["polling", "websocket"] as const)("accepts a real Socket.IO %s client", async (transport) => {
    const server = createAppServer(createApp({
      auth: unusedAuth,
      probes: { postgres: async () => true, redis: async () => true },
      readinessTimeoutMs: 100,
      rooms: unusedRooms
    }));
    const port = await server.listen(0, "127.0.0.1");
    let socket: Socket | undefined;
    try {
      socket = createSocket(`http://127.0.0.1:${port}`, { path: "/socket.io", transports: [transport], forceNew: true, reconnection: false });
      await new Promise<void>((resolve, reject) => { socket?.once("connect", resolve); socket?.once("connect_error", reject); });
      expect(socket.io.engine.transport.name).toBe(transport);
    } finally { socket?.disconnect(); await server.close(); }
  });
});
