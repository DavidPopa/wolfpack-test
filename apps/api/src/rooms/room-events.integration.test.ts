import { randomUUID } from "node:crypto";
import {
  roomCreatedEventPayloadSchema,
  type RoomCreatedEventPayload
} from "@map-chat/contracts";
import { createClient } from "redis";
import request from "supertest";
import { io as createSocket, type Socket } from "socket.io-client";
import { createApp } from "../app.js";
import { createPrismaClient } from "../prisma.js";
import {
  createWriteRateLimiter,
  deriveRateLimitKey,
  type AtomicRateLimitRedis,
  type WriteRateLimitConfig
} from "../rate-limit/index.js";
import { createAppServer, type RunningServer } from "../server.js";
import { createSocketRoomEventPublisher, ROOM_CREATED_EVENT } from "./events.js";
import { createPrismaRoomCreateRepository, createPrismaRoomReadRepository } from "./repository.js";
import { createRoomCreateService, createRoomListService } from "./service.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
const redisUrl = process.env.TEST_REDIS_URL;
const testKeyPrefix = process.env.TEST_REDIS_KEY_PREFIX;
if (!databaseUrl || !redisUrl || !testKeyPrefix?.startsWith("foundation:task001:")) {
  throw new Error("Room event integration tests require isolated PostgreSQL and Redis configuration");
}

type TransportName = "polling" | "websocket";

interface ObservedRoomEvent {
  transport: TransportName;
  payload: RoomCreatedEventPayload;
}

describe("room.created Socket.IO delivery with PostgreSQL and Redis", () => {
  const prisma = createPrismaClient(databaseUrl);
  const redis = createClient({ url: redisUrl, socket: { connectTimeout: 1000 } });
  const runPrefix = `${testKeyPrefix}room7:${randomUUID().replaceAll("-", "").slice(0, 12)}`;
  const ownedUserIds = new Set<string>();
  const ownedRoomIds = new Set<string>();
  const ownedRedisKeys = new Set<string>();

  function limiterConfig(limit = 10): WriteRateLimitConfig {
    return {
      keyPrefix: runPrefix,
      policies: {
        room: { limit, windowSeconds: 60 },
        message: { limit: 30, windowSeconds: 60 }
      }
    };
  }

  async function createUser(): Promise<string> {
    const userId = randomUUID();
    ownedUserIds.add(userId);
    await prisma.user.create({
      data: {
        id: userId,
        name: "Task 007 fixture",
        email: `${userId}@example.invalid`,
        emailVerified: true
      }
    });
    return userId;
  }

  async function startRoomEventServer(
    userId: string | null,
    config = limiterConfig(),
    limiterRedis: AtomicRateLimitRedis = redis
  ): Promise<{ server: RunningServer; port: number }> {
    if (userId) ownedRedisKeys.add(deriveRateLimitKey(runPrefix, "room", userId));
    const roomEvents = createSocketRoomEventPublisher();
    const app = createApp({
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
      ),
      roomEvents
    });
    const server = createAppServer(app);
    roomEvents.bind(server.io);
    const port = await server.listen(0, "127.0.0.1");
    return { server, port };
  }

  async function connectSocket(
    port: number,
    transport: TransportName,
    events: ObservedRoomEvent[]
  ): Promise<Socket> {
    const socket = createSocket(`http://127.0.0.1:${port}`, {
      path: "/socket.io",
      transports: [transport],
      forceNew: true,
      reconnection: false,
      timeout: 1000
    });
    socket.on(ROOM_CREATED_EVENT, (payload) => {
      events.push({ transport, payload: roomCreatedEventPayloadSchema.parse(payload) });
    });
    await new Promise<void>((resolve, reject) => {
      socket.once("connect", resolve);
      socket.once("connect_error", reject);
    });
    expect(socket.io.engine.transport.name).toBe(transport);
    return socket;
  }

  async function waitForEventCount(events: ObservedRoomEvent[], expectedCount: number): Promise<void> {
    const expiresAt = Date.now() + 1000;
    while (events.length < expectedCount && Date.now() < expiresAt) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    expect(events).toHaveLength(expectedCount);
  }

  async function expectNoAdditionalEvents(events: ObservedRoomEvent[], expectedCount: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(events).toHaveLength(expectedCount);
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

  it("broadcasts one canonical event to polling and websocket clients only for genuinely new rooms", async () => {
    const userId = await createUser();
    const { server, port } = await startRoomEventServer(userId);
    const events: ObservedRoomEvent[] = [];
    const sockets: Socket[] = [];
    try {
      sockets.push(await connectSocket(port, "polling", events));
      sockets.push(await connectSocket(port, "websocket", events));

      const clientRequestId = randomUUID();
      const body = { latitude: 44.4268, longitude: 26.1025, clientRequestId };
      const created = await request(server.httpServer).post("/api/rooms").send(body).expect(201);
      ownedRoomIds.add(created.body.id as string);

      await waitForEventCount(events, 2);
      expect(events.map((event) => event.transport).sort()).toEqual(["polling", "websocket"]);
      expect(events[0]?.payload).toEqual(events[1]?.payload);
      expect(events[0]?.payload).toEqual({
        room: {
          id: created.body.id,
          title: created.body.title,
          latitude: created.body.latitude,
          longitude: created.body.longitude,
          createdAt: created.body.createdAt
        },
        clientRequestId
      });
      expect(JSON.stringify(events[0]?.payload)).not.toMatch(/creator|email|session/i);
      await expect(prisma.room.findUniqueOrThrow({ where: { id: created.body.id as string } }))
        .resolves.toMatchObject({ clientRequestId, creatorId: userId });

      await request(server.httpServer).post("/api/rooms").send(body).expect(200, created.body);
      await expectNoAdditionalEvents(events, 2);

      await request(server.httpServer).post("/api/rooms").send({ ...body, latitude: 45 }).expect(409);
      await expectNoAdditionalEvents(events, 2);

      const concurrentClientRequestId = randomUUID();
      const concurrentBody = { latitude: 12.345678, longitude: -98.765432, clientRequestId: concurrentClientRequestId };
      const concurrent = await Promise.all([
        request(server.httpServer).post("/api/rooms").send(concurrentBody),
        request(server.httpServer).post("/api/rooms").send(concurrentBody)
      ]);
      expect(concurrent.map((response) => response.status).sort()).toEqual([200, 201]);
      expect(concurrent[0]?.body).toEqual(concurrent[1]?.body);
      ownedRoomIds.add(concurrent[0]?.body.id as string);
      await waitForEventCount(events, 4);
      expect(events.filter((event) => event.payload.clientRequestId === concurrentClientRequestId)).toHaveLength(2);
      await expectNoAdditionalEvents(events, 4);
      expect(await prisma.room.count({ where: { creatorId: userId, clientRequestId: concurrentClientRequestId } })).toBe(1);
    } finally {
      for (const socket of sockets) socket.disconnect();
      await server.close();
    }
  });

  it("emits nothing for auth, validation, rate, Redis and database failure paths", async () => {
    const realUserId = await createUser();
    const databaseFailureUserId = randomUUID();
    ownedRedisKeys.add(deriveRateLimitKey(runPrefix, "room", databaseFailureUserId));
    const unavailableRedis = { eval: async () => { throw new Error("fixture Redis outage"); } };

    const scenarios: Array<{
      name: string;
      userId: string | null;
      config?: WriteRateLimitConfig;
      limiterRedis?: AtomicRateLimitRedis;
      body: Record<string, unknown>;
      expectedStatus: number;
    }> = [
      {
        name: "unauthenticated",
        userId: null,
        body: { latitude: 1, longitude: 2, clientRequestId: randomUUID() },
        expectedStatus: 401
      },
      {
        name: "invalid strict payload",
        userId: realUserId,
        body: { latitude: 1, longitude: 2, clientRequestId: randomUUID(), title: "client title" },
        expectedStatus: 400
      },
      {
        name: "rate limited",
        userId: realUserId,
        config: limiterConfig(0),
        body: { latitude: 3, longitude: 4, clientRequestId: randomUUID() },
        expectedStatus: 429
      },
      {
        name: "Redis unavailable",
        userId: realUserId,
        limiterRedis: unavailableRedis,
        body: { latitude: 5, longitude: 6, clientRequestId: randomUUID() },
        expectedStatus: 503
      },
      {
        name: "database foreign-key failure",
        userId: databaseFailureUserId,
        body: { latitude: 7, longitude: 8, clientRequestId: randomUUID() },
        expectedStatus: 500
      }
    ];

    for (const scenario of scenarios) {
      const { server, port } = await startRoomEventServer(
        scenario.userId,
        scenario.config,
        scenario.limiterRedis
      );
      const events: ObservedRoomEvent[] = [];
      const socket = await connectSocket(port, "websocket", events);
      try {
        await request(server.httpServer).post("/api/rooms").send(scenario.body).expect(scenario.expectedStatus);
        await expectNoAdditionalEvents(events, 0);
      } catch (error) {
        throw new Error(`${scenario.name} scenario failed`, { cause: error });
      } finally {
        socket.disconnect();
        await server.close();
      }
    }
  });

  it("keeps durable HTTP creation independent of absent or disconnected clients", async () => {
    const userId = await createUser();
    const { server, port } = await startRoomEventServer(userId);
    try {
      const noClient = await request(server.httpServer).post("/api/rooms")
        .send({ latitude: 20, longitude: 30, clientRequestId: randomUUID() })
        .expect(201);
      ownedRoomIds.add(noClient.body.id as string);

      const events: ObservedRoomEvent[] = [];
      const socket = await connectSocket(port, "polling", events);
      socket.disconnect();
      await new Promise((resolve) => setTimeout(resolve, 50));

      const disconnectedClient = await request(server.httpServer).post("/api/rooms")
        .send({ latitude: 21, longitude: 31, clientRequestId: randomUUID() })
        .expect(201);
      ownedRoomIds.add(disconnectedClient.body.id as string);
      await expectNoAdditionalEvents(events, 0);
      expect(await prisma.room.count({ where: { creatorId: userId } })).toBe(2);
    } finally {
      await server.close();
    }
  });
});
