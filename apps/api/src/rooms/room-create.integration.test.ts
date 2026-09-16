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
import { createAppServer } from "../server.js";
import { createPrismaRoomCreateRepository, createPrismaRoomReadRepository } from "./repository.js";
import { createRoomCreateService, createRoomListService } from "./service.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
const redisUrl = process.env.TEST_REDIS_URL;
const testKeyPrefix = process.env.TEST_REDIS_KEY_PREFIX;
if (!databaseUrl || !redisUrl || !testKeyPrefix?.startsWith("foundation:task001:")) {
  throw new Error("Room creation integration tests require isolated PostgreSQL and Redis configuration");
}

describe("POST /api/rooms with PostgreSQL and Redis", () => {
  const prisma = createPrismaClient(databaseUrl);
  const redis = createClient({ url: redisUrl, socket: { connectTimeout: 1000 } });
  const runPrefix = `${testKeyPrefix}room3:${randomUUID().replaceAll("-", "").slice(0, 12)}`;
  const ownedUserIds = new Set<string>();
  const ownedRoomIds = new Set<string>();
  const ownedRedisKeys = new Set<string>();

  function limiterConfig(limit = 5): WriteRateLimitConfig {
    return {
      keyPrefix: runPrefix,
      policies: {
        room: { limit, windowSeconds: 60 },
        message: { limit: 30, windowSeconds: 60 }
      }
    };
  }

  function appFor(
    userId: string | null,
    config = limiterConfig(),
    limiterRedis: AtomicRateLimitRedis = redis
  ) {
    if (userId) ownedRedisKeys.add(deriveRateLimitKey(runPrefix, "room", userId));
    return createApp({
      auth: {
        handler: (_request, response) => response.sendStatus(500),
        resolveIdentity: async () => userId ? { userId } : null
      },
      probes: { postgres: async () => true, redis: async () => true },
      readinessTimeoutMs: 100,
      rooms: createRoomListService(createPrismaRoomReadRepository(prisma)),
      roomCreation: createRoomCreateService(
        createPrismaRoomCreateRepository(prisma),
        createWriteRateLimiter(limiterRedis, config)
      )
    });
  }

  async function createUser(): Promise<string> {
    const userId = randomUUID();
    ownedUserIds.add(userId);
    await prisma.user.create({
      data: {
        id: userId,
        name: "Task 003 fixture",
        email: `${userId}@example.invalid`,
        emailVerified: true
      }
    });
    return userId;
  }

  beforeAll(async () => {
    await prisma.$connect();
    await redis.connect();
  });

  afterEach(async () => {
    const roomIds = [...ownedRoomIds];
    const userIds = [...ownedUserIds];
    const keys = [...ownedRedisKeys];
    if (roomIds.length) await prisma.room.deleteMany({ where: { id: { in: roomIds } } });
    if (userIds.length) {
      await prisma.room.deleteMany({ where: { creatorId: { in: userIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
    if (keys.length) await redis.del(keys);
    expect(await prisma.room.count({ where: { creatorId: { in: userIds } } })).toBe(0);
    expect(await prisma.user.count({ where: { id: { in: userIds } } })).toBe(0);
    if (keys.length) expect(await redis.exists(keys)).toBe(0);
    ownedRoomIds.clear();
    ownedUserIds.clear();
    ownedRedisKeys.clear();
  });

  afterAll(async () => {
    await redis.quit();
    await prisma.$disconnect();
  });

  it("returns 401/400 and creates a server-derived room without a product broadcast", async () => {
    const clientRequestId = randomUUID();
    await request(appFor(null)).post("/api/rooms")
      .send({ latitude: 44, longitude: 26, clientRequestId })
      .expect(401, { error: { code: "UNAUTHORIZED", message: "Authentication required" } });

    const userId = await createUser();
    await request(appFor(userId)).post("/api/rooms")
      .send({ latitude: 44, longitude: 26, clientRequestId, creatorId: userId })
      .expect(400, { error: { code: "INVALID_ROOM_REQUEST", message: "Invalid room request" } });

    const app = appFor(userId);
    const server = createAppServer(app);
    const observableIo = server.io as unknown as { emit: (event: string, ...arguments_: unknown[]) => unknown };
    const originalEmit = observableIo.emit.bind(server.io);
    let productBroadcastCount = 0;
    observableIo.emit = (event, ...arguments_) => {
      if (event === "room.created") productBroadcastCount += 1;
      return originalEmit(event, ...arguments_);
    };
    try {
      const createResponse = await request(server.httpServer).post("/api/rooms")
        .send({ latitude: -0, longitude: 26.102512345, clientRequestId })
        .expect(201);
      ownedRoomIds.add(createResponse.body.id as string);
      expect(createResponse.body).toEqual({
        id: expect.any(String),
        title: "Room at 0.0000, 26.1025",
        latitude: 0,
        longitude: 26.102512345,
        createdAt: expect.any(String),
        clientRequestId
      });
      expect(Object.keys(createResponse.body).sort()).toEqual([
        "clientRequestId", "createdAt", "id", "latitude", "longitude", "title"
      ]);
      expect(productBroadcastCount).toBe(0);
      const persisted = await prisma.room.findUniqueOrThrow({ where: { id: createResponse.body.id as string } });
      expect(persisted).toMatchObject({
        creatorId: userId,
        clientRequestId,
        title: "Room at 0.0000, 26.1025",
        latitude: 0,
        longitude: 26.102512345
      });
    } finally {
      await server.close();
    }
  });

  it("returns 200 for a sequential replay and 409 for conflicting reuse without another charge", async () => {
    const userId = await createUser();
    const app = appFor(userId);
    const clientRequestId = randomUUID();
    const body = { latitude: 44.4268, longitude: 26.1025, clientRequestId };
    const created = await request(app).post("/api/rooms").send(body).expect(201);
    ownedRoomIds.add(created.body.id as string);
    await request(app).post("/api/rooms").send(body).expect(200, created.body);
    await request(app).post("/api/rooms").send({ ...body, latitude: 45 }).expect(409, {
      error: { code: "ROOM_REQUEST_CONFLICT", message: "Request ID already used with different coordinates" }
    });
    expect(await prisma.room.count({ where: { creatorId: userId, clientRequestId } })).toBe(1);
    expect(await redis.get(deriveRateLimitKey(runPrefix, "room", userId))).toBe("1");
  });

  it("serializes concurrent identical requests to one canonical room", async () => {
    const userId = await createUser();
    const app = appFor(userId, limiterConfig(10));
    const clientRequestId = randomUUID();
    const body = { latitude: 12.345678, longitude: -98.765432, clientRequestId };
    const responses = await Promise.all([
      request(app).post("/api/rooms").send(body),
      request(app).post("/api/rooms").send(body)
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 201]);
    expect(responses[0]?.body).toEqual(responses[1]?.body);
    ownedRoomIds.add(responses[0]?.body.id as string);
    expect(await prisma.room.count({ where: { creatorId: userId, clientRequestId } })).toBe(1);
  });

  it("returns 429 with matching retry timing and performs no second write", async () => {
    const userId = await createUser();
    const app = appFor(userId, limiterConfig(1));
    const first = await request(app).post("/api/rooms")
      .send({ latitude: 1, longitude: 2, clientRequestId: randomUUID() }).expect(201);
    ownedRoomIds.add(first.body.id as string);
    const limited = await request(app).post("/api/rooms")
      .send({ latitude: 3, longitude: 4, clientRequestId: randomUUID() }).expect(429);
    expect(limited.body).toEqual({
      error: {
        code: "ROOM_RATE_LIMITED",
        message: "Room creation rate limit exceeded",
        retryAfterSeconds: expect.any(Number)
      }
    });
    expect(limited.body.error.retryAfterSeconds).toBeGreaterThan(0);
    expect(limited.body.error.retryAfterSeconds).toBeLessThanOrEqual(60);
    expect(limited.headers["retry-after"]).toBe(String(limited.body.error.retryAfterSeconds));
    expect(await prisma.room.count({ where: { creatorId: userId } })).toBe(1);
  });

  it("fails closed with 503 while the public room list remains available", async () => {
    const userId = await createUser();
    const unavailableRedis = { eval: async () => { throw new Error("fixture outage"); } };
    const app = appFor(userId, limiterConfig(), unavailableRedis);
    await request(app).post("/api/rooms")
      .send({ latitude: 5, longitude: 6, clientRequestId: randomUUID() })
      .expect(503, {
        error: {
          code: "ROOM_RATE_LIMIT_UNAVAILABLE",
          message: "Room creation is temporarily unavailable",
          retryable: true
        }
      });
    expect(await prisma.room.count({ where: { creatorId: userId } })).toBe(0);
    await request(app).get("/api/rooms").expect(200, []);
  });
});
