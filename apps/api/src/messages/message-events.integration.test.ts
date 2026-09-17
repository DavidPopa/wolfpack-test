import { randomUUID } from "node:crypto";
import {
  messageCreatedEventPayloadSchema,
  type MessageCreatedEventPayload
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
import {
  createSocketMessageEventPublisher,
  MESSAGE_CREATED_EVENT,
  MESSAGE_SUBSCRIBE_EVENT,
  MESSAGE_UNSUBSCRIBE_EVENT,
  messageRoomChannel
} from "./events.js";
import {
  createPrismaMessageCreateRepository,
  createPrismaMessageReadRepository
} from "./repository.js";
import { createMessageCreateService, createMessageHistoryService } from "./service.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
const redisUrl = process.env.TEST_REDIS_URL;
const testKeyPrefix = process.env.TEST_REDIS_KEY_PREFIX;
if (!databaseUrl || !redisUrl || !testKeyPrefix?.startsWith("foundation:task001:")) {
  throw new Error("Message event integration tests require isolated PostgreSQL and Redis configuration");
}

type TransportName = "polling" | "websocket";

interface ObservedMessageEvent {
  payload: MessageCreatedEventPayload;
  persistedBeforeEvent: boolean;
}

describe("room-scoped message Socket.IO delivery with PostgreSQL and Redis", () => {
  const prisma = createPrismaClient(databaseUrl);
  const redis = createClient({ url: redisUrl, socket: { connectTimeout: 1000 } });
  const runPrefix = `${testKeyPrefix}message3:${randomUUID().replaceAll("-", "").slice(0, 12)}`;
  const ownedUserIds = new Set<string>();
  const ownedRoomIds = new Set<string>();
  const ownedMessageIds = new Set<string>();
  const ownedRedisKeys = new Set<string>();

  function limiterConfig(limit = 20): WriteRateLimitConfig {
    return {
      keyPrefix: runPrefix,
      policies: {
        room: { limit: 10, windowSeconds: 60 },
        message: { limit, windowSeconds: 60 }
      }
    };
  }

  async function createUser(name = "Message realtime fixture"): Promise<string> {
    const id = randomUUID();
    ownedUserIds.add(id);
    await prisma.user.create({
      data: { id, name, email: `${id}@example.invalid`, emailVerified: true }
    });
    return id;
  }

  async function createRoom(creatorId: string): Promise<string> {
    const id = randomUUID();
    ownedRoomIds.add(id);
    await prisma.room.create({
      data: {
        id,
        title: `Realtime room ${id.slice(0, 8)}`,
        latitude: 44,
        longitude: 26,
        creatorId,
        clientRequestId: randomUUID()
      }
    });
    return id;
  }

  async function startMessageServer(
    authorId: string | null,
    config = limiterConfig(),
    limiterRedis: AtomicRateLimitRedis = redis
  ): Promise<{ server: RunningServer; port: number }> {
    if (authorId) ownedRedisKeys.add(deriveRateLimitKey(runPrefix, "message", authorId));
    const messageEvents = createSocketMessageEventPublisher();
    const app = createApp({
      auth: {
        handler: (_request, response) => response.sendStatus(500),
        resolveIdentity: async () => authorId ? { userId: authorId } : null
      },
      probes: { postgres: async () => true, redis: async () => true },
      readinessTimeoutMs: 100,
      rooms: { listPublicRooms: async () => [] },
      roomCreation: { createRoom: async () => ({ status: "unavailable" }) },
      messages: createMessageHistoryService(createPrismaMessageReadRepository(prisma)),
      messageCreation: createMessageCreateService(
        createPrismaMessageCreateRepository(prisma),
        createWriteRateLimiter(limiterRedis, config)
      ),
      messageEvents
    });
    const server = createAppServer(app);
    messageEvents.bind(server.io);
    const port = await server.listen(0, "127.0.0.1");
    return { server, port };
  }

  async function connectSocket(
    port: number,
    transport: TransportName,
    events: ObservedMessageEvent[]
  ): Promise<Socket> {
    const socket = createSocket(`http://127.0.0.1:${port}`, {
      path: "/socket.io",
      transports: [transport],
      forceNew: true,
      reconnection: false,
      timeout: 1000
    });
    socket.on(MESSAGE_CREATED_EVENT, async (candidate) => {
      const payload = messageCreatedEventPayloadSchema.parse(candidate);
      const persisted = await prisma.message.findUnique({ where: { id: payload.message.id } });
      events.push({ payload, persistedBeforeEvent: persisted !== null });
    });
    await new Promise<void>((resolve, reject) => {
      socket.once("connect", resolve);
      socket.once("connect_error", reject);
    });
    expect(socket.io.engine.transport.name).toBe(transport);
    return socket;
  }

  async function waitUntil(predicate: () => boolean, message: string): Promise<void> {
    const expiresAt = Date.now() + 1500;
    while (!predicate() && Date.now() < expiresAt) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    if (!predicate()) throw new Error(message);
  }

  async function subscribe(server: RunningServer, socket: Socket, roomId: string): Promise<void> {
    socket.emit(MESSAGE_SUBSCRIBE_EVENT, { roomId });
    await waitUntil(
      () => server.io.sockets.adapter.rooms.get(messageRoomChannel(roomId))?.has(socket.id ?? "") === true,
      `socket did not subscribe to ${roomId}`
    );
  }

  async function unsubscribe(server: RunningServer, socket: Socket, roomId: string): Promise<void> {
    socket.emit(MESSAGE_UNSUBSCRIBE_EVENT, { roomId });
    await waitUntil(
      () => server.io.sockets.adapter.rooms.get(messageRoomChannel(roomId))?.has(socket.id ?? "") !== true,
      `socket did not unsubscribe from ${roomId}`
    );
  }

  async function expectNoAdditionalEvents(events: ObservedMessageEvent[], count: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 175));
    expect(events).toHaveLength(count);
  }

  beforeAll(async () => {
    await prisma.$connect();
    await redis.connect();
  });

  afterEach(async () => {
    const messageIds = [...ownedMessageIds];
    const roomIds = [...ownedRoomIds];
    const userIds = [...ownedUserIds];
    const keys = [...ownedRedisKeys];
    if (messageIds.length) await prisma.message.deleteMany({ where: { id: { in: messageIds } } });
    if (roomIds.length) await prisma.message.deleteMany({ where: { roomId: { in: roomIds } } });
    if (roomIds.length) await prisma.room.deleteMany({ where: { id: { in: roomIds } } });
    if (userIds.length) await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    if (keys.length) await redis.del(keys);
    expect(await prisma.message.count({ where: { id: { in: messageIds } } })).toBe(0);
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

  it("delivers persisted messages only to current room subscribers across polling and WebSocket", async () => {
    const authorId = await createUser("Public event author");
    const firstRoomId = await createRoom(authorId);
    const secondRoomId = await createRoom(authorId);
    const { server, port } = await startMessageServer(authorId);
    const firstEvents: ObservedMessageEvent[] = [];
    const secondEvents: ObservedMessageEvent[] = [];
    const otherRoomEvents: ObservedMessageEvent[] = [];
    const sockets: Socket[] = [];
    try {
      const polling = await connectSocket(port, "polling", firstEvents);
      const websocket = await connectSocket(port, "websocket", secondEvents);
      const otherRoom = await connectSocket(port, "websocket", otherRoomEvents);
      sockets.push(polling, websocket, otherRoom);
      await subscribe(server, polling, firstRoomId);
      await subscribe(server, websocket, firstRoomId);
      await subscribe(server, otherRoom, secondRoomId);

      const clientRequestId = randomUUID();
      const created = await request(server.httpServer).post(`/api/rooms/${firstRoomId}/messages`)
        .send({ body: "  Persist before broadcast  ", clientRequestId }).expect(201);
      ownedMessageIds.add(created.body.id as string);
      await waitUntil(() => firstEvents.length === 1 && secondEvents.length === 1, "subscribers missed message.created");
      expect(otherRoomEvents).toHaveLength(0);
      for (const observed of [...firstEvents, ...secondEvents]) {
        expect(observed.persistedBeforeEvent).toBe(true);
        expect(observed.payload).toEqual({
          message: {
            id: created.body.id,
            roomId: firstRoomId,
            body: "Persist before broadcast",
            createdAt: created.body.createdAt,
            author: { name: "Public event author", image: null }
          },
          clientRequestId
        });
        expect(JSON.stringify(observed.payload)).not.toMatch(/authorId|email|session|account/i);
      }

      await request(server.httpServer).post(`/api/rooms/${firstRoomId}/messages`)
        .send({ body: "Persist before broadcast", clientRequestId }).expect(200, created.body);
      await expectNoAdditionalEvents(firstEvents, 1);
      await expectNoAdditionalEvents(secondEvents, 1);

      await subscribe(server, polling, secondRoomId);
      expect(server.io.sockets.adapter.rooms.get(messageRoomChannel(firstRoomId))?.has(polling.id ?? ""))
        .toBe(false);
      await unsubscribe(server, websocket, firstRoomId);
      const silentFirstRoom = await request(server.httpServer).post(`/api/rooms/${firstRoomId}/messages`)
        .send({ body: "No remaining subscribers", clientRequestId: randomUUID() }).expect(201);
      ownedMessageIds.add(silentFirstRoom.body.id as string);
      await expectNoAdditionalEvents(firstEvents, 1);
      await expectNoAdditionalEvents(secondEvents, 1);

      const secondRoomCreated = await request(server.httpServer).post(`/api/rooms/${secondRoomId}/messages`)
        .send({ body: "Second room only", clientRequestId: randomUUID() }).expect(201);
      ownedMessageIds.add(secondRoomCreated.body.id as string);
      await waitUntil(
        () => firstEvents.length === 2 && otherRoomEvents.length === 1,
        "current second-room subscribers missed message.created"
      );
      expect(secondEvents).toHaveLength(1);

      const disconnectedId = otherRoom.id;
      otherRoom.disconnect();
      await waitUntil(
        () => server.io.sockets.adapter.rooms.get(messageRoomChannel(secondRoomId))?.has(disconnectedId ?? "") !== true,
        "disconnect did not remove message room membership"
      );
      const afterDisconnect = await request(server.httpServer).post(`/api/rooms/${secondRoomId}/messages`)
        .send({ body: "Connected subscriber only", clientRequestId: randomUUID() }).expect(201);
      ownedMessageIds.add(afterDisconnect.body.id as string);
      await waitUntil(() => firstEvents.length === 3, "connected subscriber missed post-disconnect event");
      await expectNoAdditionalEvents(otherRoomEvents, 1);
    } finally {
      for (const socket of sockets) socket.disconnect();
      await server.close();
    }
  });

  it("emits nothing for conflict, auth, validation, rate, Redis, room and database failures", async () => {
    const realAuthorId = await createUser();
    const roomId = await createRoom(realAuthorId);
    const existingRequestId = randomUUID();
    const seed = await prisma.message.create({
      data: {
        roomId,
        authorId: realAuthorId,
        body: "Existing",
        clientRequestId: existingRequestId
      }
    });
    ownedMessageIds.add(seed.id);
    const missingAuthorId = randomUUID();
    ownedRedisKeys.add(deriveRateLimitKey(runPrefix, "message", missingAuthorId));
    const unavailableRedis: AtomicRateLimitRedis = {
      eval: async () => { throw new Error("fixture Redis outage"); }
    };
    const scenarios: Array<{
      name: string;
      authorId: string | null;
      body: Record<string, unknown>;
      expectedStatus: number;
      targetRoomId?: string;
      config?: WriteRateLimitConfig;
      limiterRedis?: AtomicRateLimitRedis;
    }> = [
      { name: "conflict", authorId: realAuthorId, body: { body: "Changed", clientRequestId: existingRequestId }, expectedStatus: 409 },
      { name: "unauthenticated", authorId: null, body: { body: "Denied", clientRequestId: randomUUID() }, expectedStatus: 401 },
      { name: "invalid strict payload", authorId: realAuthorId, body: { body: "Invalid", clientRequestId: randomUUID(), authorId: realAuthorId }, expectedStatus: 400 },
      { name: "rate limited", authorId: realAuthorId, body: { body: "Limited", clientRequestId: randomUUID() }, expectedStatus: 429, config: limiterConfig(0) },
      { name: "Redis unavailable", authorId: realAuthorId, body: { body: "Unavailable", clientRequestId: randomUUID() }, expectedStatus: 503, limiterRedis: unavailableRedis },
      { name: "unknown room", authorId: realAuthorId, body: { body: "Missing room", clientRequestId: randomUUID() }, expectedStatus: 404, targetRoomId: randomUUID() },
      { name: "database foreign-key failure", authorId: missingAuthorId, body: { body: "Database failure", clientRequestId: randomUUID() }, expectedStatus: 500 }
    ];

    for (const scenario of scenarios) {
      const { server, port } = await startMessageServer(
        scenario.authorId,
        scenario.config,
        scenario.limiterRedis
      );
      const events: ObservedMessageEvent[] = [];
      const socket = await connectSocket(port, "websocket", events);
      try {
        await subscribe(server, socket, roomId);
        await request(server.httpServer).post(`/api/rooms/${scenario.targetRoomId ?? roomId}/messages`)
          .send(scenario.body).expect(scenario.expectedStatus);
        await expectNoAdditionalEvents(events, 0);
      } catch (error) {
        throw new Error(`${scenario.name} scenario failed`, { cause: error });
      } finally {
        socket.disconnect();
        await server.close();
      }
    }
    expect(await prisma.message.count({ where: { roomId } })).toBe(1);
  });
});
