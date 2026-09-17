import { randomUUID } from "node:crypto";
import { createClient } from "redis";
import request from "supertest";
import { createApp } from "../app.js";
import { createPrismaClient } from "../prisma.js";
import {
  createWriteRateLimiter,
  deriveRateLimitKey,
  type AtomicRateLimitRedis,
  type WriteRateLimitConfig
} from "../rate-limit/index.js";
import {
  createPrismaMessageCreateRepository,
  createPrismaMessageReadRepository
} from "./repository.js";
import { createMessageCreateService, createMessageHistoryService } from "./service.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
const redisUrl = process.env.TEST_REDIS_URL;
const testKeyPrefix = process.env.TEST_REDIS_KEY_PREFIX;
if (!databaseUrl || !redisUrl || !testKeyPrefix?.startsWith("foundation:task001:")) {
  throw new Error("Message creation integration tests require isolated PostgreSQL and Redis configuration");
}

describe("POST /api/rooms/:roomId/messages with PostgreSQL and Redis", () => {
  const prisma = createPrismaClient(databaseUrl);
  const redis = createClient({ url: redisUrl, socket: { connectTimeout: 1000 } });
  const runPrefix = `${testKeyPrefix}message2:${randomUUID().replaceAll("-", "").slice(0, 12)}`;
  const ownedUserIds = new Set<string>();
  const ownedRoomIds = new Set<string>();
  const ownedMessageIds = new Set<string>();
  const ownedRedisKeys = new Set<string>();

  function limiterConfig(limit = 5, windowSeconds = 60): WriteRateLimitConfig {
    return {
      keyPrefix: runPrefix,
      policies: {
        room: { limit: 5, windowSeconds: 60 },
        message: { limit, windowSeconds }
      }
    };
  }

  function appFor(
    userId: string | null,
    config = limiterConfig(),
    limiterRedis: AtomicRateLimitRedis = redis
  ) {
    if (userId) ownedRedisKeys.add(deriveRateLimitKey(runPrefix, "message", userId));
    return createApp({
      auth: {
        handler: (_request, response) => response.sendStatus(500),
        resolveIdentity: async () => userId ? { userId } : null
      },
      probes: { postgres: async () => true, redis: async () => true },
      readinessTimeoutMs: 100,
      rooms: { listPublicRooms: async () => [] },
      roomCreation: { createRoom: async () => ({ status: "unavailable" }) },
      messages: createMessageHistoryService(createPrismaMessageReadRepository(prisma)),
      messageCreation: createMessageCreateService(
        createPrismaMessageCreateRepository(prisma),
        createWriteRateLimiter(limiterRedis, config)
      )
    });
  }

  async function createUser(name = "Message author", image: string | null = null): Promise<string> {
    const id = randomUUID();
    ownedUserIds.add(id);
    await prisma.user.create({
      data: {
        id,
        name,
        email: `${id}@example.invalid`,
        emailVerified: true,
        image
      }
    });
    return id;
  }

  async function createRoom(creatorId: string): Promise<string> {
    const id = randomUUID();
    ownedRoomIds.add(id);
    await prisma.room.create({
      data: {
        id,
        title: "Message creation fixture",
        latitude: 44.4268,
        longitude: 26.1025,
        creatorId,
        clientRequestId: randomUUID()
      }
    });
    return id;
  }

  beforeAll(async () => {
    await prisma.$connect();
    await redis.connect();
  });

  afterEach(async () => {
    const userIds = [...ownedUserIds];
    const roomIds = [...ownedRoomIds];
    const messageIds = [...ownedMessageIds];
    const keys = [...ownedRedisKeys];
    if (userIds.length) await prisma.message.deleteMany({ where: { authorId: { in: userIds } } });
    if (messageIds.length) await prisma.message.deleteMany({ where: { id: { in: messageIds } } });
    if (roomIds.length) await prisma.room.deleteMany({ where: { id: { in: roomIds } } });
    if (userIds.length) await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    if (keys.length) await redis.del(keys);
    expect(await prisma.message.count({ where: { authorId: { in: userIds } } })).toBe(0);
    expect(await prisma.room.count({ where: { id: { in: roomIds } } })).toBe(0);
    expect(await prisma.user.count({ where: { id: { in: userIds } } })).toBe(0);
    if (keys.length) expect(await redis.exists(keys)).toBe(0);
    ownedMessageIds.clear();
    ownedRoomIds.clear();
    ownedUserIds.clear();
    ownedRedisKeys.clear();
  });

  afterAll(async () => {
    await redis.quit();
    await prisma.$disconnect();
  });

  it("enforces auth/strict input/missing room and creates normalized text with server-derived authorship", async () => {
    const clientRequestId = randomUUID();
    await request(appFor(null)).post(`/api/rooms/${randomUUID()}/messages`)
      .send({ body: "hello", clientRequestId })
      .expect(401, { error: { code: "UNAUTHORIZED", message: "Authentication required" } });

    const authorId = await createUser("Public author", "https://example.invalid/avatar.png");
    const roomId = await createRoom(authorId);
    await request(appFor(authorId)).post(`/api/rooms/${roomId}/messages`)
      .send({ body: "hello", clientRequestId, authorId: randomUUID() })
      .expect(400, { error: { code: "INVALID_MESSAGE_REQUEST", message: "Invalid message request" } });
    await request(appFor(authorId)).post(`/api/rooms/${randomUUID()}/messages`)
      .send({ body: "hello", clientRequestId })
      .expect(404, { error: { code: "ROOM_NOT_FOUND", message: "Room not found" } });
    expect(await redis.get(deriveRateLimitKey(runPrefix, "message", authorId))).toBeNull();

    const created = await request(appFor(authorId)).post(`/api/rooms/${roomId}/messages`)
      .send({ body: "  <b>plain text</b>  ", clientRequestId })
      .expect(201);
    ownedMessageIds.add(created.body.id as string);
    expect(created.body).toEqual({
      id: expect.any(String),
      roomId,
      body: "<b>plain text</b>",
      createdAt: expect.any(String),
      author: { name: "Public author", image: "https://example.invalid/avatar.png" },
      clientRequestId
    });
    expect(Object.keys(created.body).sort()).toEqual([
      "author", "body", "clientRequestId", "createdAt", "id", "roomId"
    ]);
    expect(Object.keys(created.body.author).sort()).toEqual(["image", "name"]);
    expect(JSON.stringify(created.body)).not.toMatch(/authorId|email|session|account/i);
    const persisted = await prisma.message.findUniqueOrThrow({ where: { id: created.body.id as string } });
    expect(persisted).toMatchObject({
      roomId,
      authorId,
      body: "<b>plain text</b>",
      clientRequestId
    });
  });

  it("returns one canonical row for replay and rejects changed body or room without another Redis charge", async () => {
    const authorId = await createUser();
    const roomId = await createRoom(authorId);
    const secondRoomId = await createRoom(authorId);
    const clientRequestId = randomUUID();
    const body = { body: "Canonical message", clientRequestId };
    const app = appFor(authorId);
    const created = await request(app).post(`/api/rooms/${roomId}/messages`).send(body).expect(201);
    ownedMessageIds.add(created.body.id as string);
    await request(app).post(`/api/rooms/${roomId}/messages`)
      .send({ body: "  Canonical message  ", clientRequestId }).expect(200, created.body);
    await request(app).post(`/api/rooms/${roomId}/messages`)
      .send({ body: "Different message", clientRequestId }).expect(409, {
        error: { code: "MESSAGE_REQUEST_CONFLICT", message: "Request ID already used with a different message" }
      });
    await request(app).post(`/api/rooms/${secondRoomId}/messages`).send(body).expect(409, {
      error: { code: "MESSAGE_REQUEST_CONFLICT", message: "Request ID already used with a different message" }
    });
    expect(await prisma.message.count({ where: { authorId, clientRequestId } })).toBe(1);
    expect(await redis.get(deriveRateLimitKey(runPrefix, "message", authorId))).toBe("1");
  });

  it("serializes concurrent identical retries to one PostgreSQL row and one canonical result", async () => {
    const authorId = await createUser();
    const roomId = await createRoom(authorId);
    const clientRequestId = randomUUID();
    const body = { body: "Concurrent message", clientRequestId };
    const app = appFor(authorId, limiterConfig(10));
    const responses = await Promise.all([
      request(app).post(`/api/rooms/${roomId}/messages`).send(body),
      request(app).post(`/api/rooms/${roomId}/messages`).send(body)
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 201]);
    expect(responses[0]?.body).toEqual(responses[1]?.body);
    ownedMessageIds.add(responses[0]?.body.id as string);
    expect(await prisma.message.count({ where: { authorId, clientRequestId } })).toBe(1);
  });

  it("returns 429 with bounded timing and accepts a fresh request after real Redis expiry", async () => {
    const authorId = await createUser();
    const roomId = await createRoom(authorId);
    const key = deriveRateLimitKey(runPrefix, "message", authorId);
    const app = appFor(authorId, limiterConfig(1, 10));
    const first = await request(app).post(`/api/rooms/${roomId}/messages`)
      .send({ body: "First", clientRequestId: randomUUID() }).expect(201);
    ownedMessageIds.add(first.body.id as string);
    const limited = await request(app).post(`/api/rooms/${roomId}/messages`)
      .send({ body: "Second", clientRequestId: randomUUID() }).expect(429);
    expect(limited.body).toEqual({
      error: {
        code: "MESSAGE_RATE_LIMITED",
        message: "Message rate limit exceeded",
        retryAfterSeconds: expect.any(Number)
      }
    });
    expect(limited.body.error.retryAfterSeconds).toBeGreaterThan(0);
    expect(limited.body.error.retryAfterSeconds).toBeLessThanOrEqual(10);
    expect(limited.headers["retry-after"]).toBe(String(limited.body.error.retryAfterSeconds));
    expect(await prisma.message.count({ where: { authorId } })).toBe(1);

    await redis.pExpire(key, 20);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(await redis.exists(key)).toBe(0);
    const afterExpiry = await request(app).post(`/api/rooms/${roomId}/messages`)
      .send({ body: "After expiry", clientRequestId: randomUUID() }).expect(201);
    ownedMessageIds.add(afterExpiry.body.id as string);
    expect(await redis.get(key)).toBe("1");
  });

  it("writes nothing on Redis failure while public PostgreSQL history remains available", async () => {
    const authorId = await createUser("Readable author");
    const roomId = await createRoom(authorId);
    const existingId = randomUUID();
    ownedMessageIds.add(existingId);
    await prisma.message.create({
      data: {
        id: existingId,
        roomId,
        authorId,
        body: "Existing public history",
        clientRequestId: randomUUID()
      }
    });
    const unavailableRedis: AtomicRateLimitRedis = {
      eval: async () => { throw new Error("fixture outage"); }
    };
    const app = appFor(authorId, limiterConfig(), unavailableRedis);
    await request(app).post(`/api/rooms/${roomId}/messages`)
      .send({ body: "Must not persist", clientRequestId: randomUUID() })
      .expect(503, {
        error: {
          code: "MESSAGE_RATE_LIMIT_UNAVAILABLE",
          message: "Message sending is temporarily unavailable",
          retryable: true
        }
      });
    expect(await prisma.message.count({ where: { roomId } })).toBe(1);
    const history = await request(app).get(`/api/rooms/${roomId}/messages`).expect(200);
    expect(history.body.messages).toEqual([{
      id: existingId,
      roomId,
      body: "Existing public history",
      createdAt: expect.any(String),
      author: { name: "Readable author", image: null }
    }]);
  });
});
