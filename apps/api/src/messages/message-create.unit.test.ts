import { randomUUID } from "node:crypto";
import {
  messageCreateErrorResponseSchema,
  messageCreateRequestSchema,
  messageCreateResponseSchema
} from "@map-chat/contracts";
import request from "supertest";
import { createApp } from "../app.js";
import type { WriteRateLimiter } from "../rate-limit/index.js";
import type { MessageEventPublisher } from "./events.js";
import {
  createPrismaMessageCreateRepository,
  type MessageCreateRecord,
  type MessageCreateRepository
} from "./repository.js";
import { createMessageCreateService, type MessageCreateService } from "./service.js";

const authorId = "author-fixture";
const roomId = "10000000-0000-4000-8000-000000000001";
const otherRoomId = "10000000-0000-4000-8000-000000000002";
const clientRequestId = "20000000-0000-4000-8000-000000000001";
const createdAt = new Date("2026-09-17T12:00:00.000Z");
const record: MessageCreateRecord = {
  id: "30000000-0000-4000-8000-000000000001",
  roomId,
  authorId,
  body: "Hello plain text",
  createdAt,
  clientRequestId,
  author: { name: "Fixture author", image: null }
};
const responseMessage = {
  id: record.id,
  roomId,
  body: record.body,
  createdAt: createdAt.toISOString(),
  author: record.author,
  clientRequestId
};

function createTestApp(
  messageCreation: MessageCreateService,
  authenticated = true,
  messageEvents?: MessageEventPublisher
) {
  return createApp({
    auth: {
      handler: (_request, response) => response.sendStatus(500),
      resolveIdentity: async () => authenticated ? { userId: authorId } : null
    },
    probes: { postgres: async () => true, redis: async () => true },
    readinessTimeoutMs: 50,
    rooms: { listPublicRooms: async () => [] },
    roomCreation: { createRoom: async () => ({ status: "unavailable" }) },
    messageCreation,
    ...(messageEvents ? { messageEvents } : {})
  });
}

describe("message create contracts and HTTP route", () => {
  it("trims plain text and rejects empty, oversized, non-UUID, and client-controlled fields", () => {
    expect(messageCreateRequestSchema.parse({ body: "  hello  ", clientRequestId }))
      .toEqual({ body: "hello", clientRequestId });
    for (const body of [
      { body: "   ", clientRequestId },
      { body: "x".repeat(1001), clientRequestId },
      { body: "hello", clientRequestId: "not-a-uuid" },
      { body: "hello", clientRequestId, authorId },
      { body: "hello", clientRequestId, roomId }
    ]) expect(messageCreateRequestSchema.safeParse(body).success).toBe(false);
  });

  it("keeps create responses and all stable errors strict", () => {
    expect(messageCreateResponseSchema.parse(responseMessage)).toEqual(responseMessage);
    expect(messageCreateResponseSchema.safeParse({
      ...responseMessage,
      authorId,
      author: { ...responseMessage.author, email: "private@example.invalid" }
    }).success).toBe(false);
    for (const candidate of [
      { error: { code: "UNAUTHORIZED", message: "Authentication required" } },
      { error: { code: "INVALID_MESSAGE_REQUEST", message: "Invalid message request" } },
      { error: { code: "ROOM_NOT_FOUND", message: "Room not found" } },
      { error: { code: "MESSAGE_REQUEST_CONFLICT", message: "Request ID already used with a different message" } },
      { error: { code: "MESSAGE_RATE_LIMITED", message: "Message rate limit exceeded", retryAfterSeconds: 1 } },
      { error: {
        code: "MESSAGE_RATE_LIMIT_UNAVAILABLE",
        message: "Message sending is temporarily unavailable",
        retryable: true
      } }
    ]) expect(messageCreateErrorResponseSchema.safeParse(candidate).success).toBe(true);
    expect(messageCreateErrorResponseSchema.safeParse({
      error: { code: "UNAUTHORIZED", message: "Authentication required", detail: "private" }
    }).success).toBe(false);
  });

  it("returns 401 before validation and derives author and room from server boundaries", async () => {
    const createMessage: MessageCreateService["createMessage"] = jest.fn();
    await request(createTestApp({ createMessage }, false))
      .post(`/api/rooms/${roomId}/messages`)
      .send({ body: " ", clientRequestId: "bad", authorId: "attacker" })
      .expect(401, { error: { code: "UNAUTHORIZED", message: "Authentication required" } });
    expect(createMessage).not.toHaveBeenCalled();

    const created = jest.fn(async () => ({ status: "created", message: responseMessage } as const));
    await request(createTestApp({ createMessage: created }))
      .post(`/api/rooms/${roomId}/messages`)
      .send({ body: "  Hello plain text  ", clientRequestId })
      .expect(201, responseMessage);
    expect(created).toHaveBeenCalledWith(authorId, roomId, { body: "Hello plain text", clientRequestId });
  });

  it("returns 400 for invalid URL/body and 200 for a canonical replay", async () => {
    const createMessage: MessageCreateService["createMessage"] = jest.fn();
    await request(createTestApp({ createMessage }))
      .post("/api/rooms/not-a-uuid/messages")
      .send({ body: "hello", clientRequestId })
      .expect(400, { error: { code: "INVALID_MESSAGE_REQUEST", message: "Invalid message request" } });
    await request(createTestApp({ createMessage }))
      .post(`/api/rooms/${roomId}/messages`)
      .send({ body: "hello", clientRequestId, author: "forbidden" })
      .expect(400, { error: { code: "INVALID_MESSAGE_REQUEST", message: "Invalid message request" } });
    expect(createMessage).not.toHaveBeenCalled();

    await request(createTestApp({
      createMessage: async () => ({ status: "replayed", message: responseMessage })
    })).post(`/api/rooms/${roomId}/messages`)
      .send({ body: record.body, clientRequestId })
      .expect(200, responseMessage);
  });

  it("maps missing room, conflict, rate limit, and Redis failure to stable responses", async () => {
    const body = { body: record.body, clientRequestId };
    await request(createTestApp({ createMessage: async () => ({ status: "room_not_found" }) }))
      .post(`/api/rooms/${roomId}/messages`).send(body).expect(404, {
        error: { code: "ROOM_NOT_FOUND", message: "Room not found" }
      });
    await request(createTestApp({ createMessage: async () => ({ status: "conflict" }) }))
      .post(`/api/rooms/${roomId}/messages`).send(body).expect(409, {
        error: { code: "MESSAGE_REQUEST_CONFLICT", message: "Request ID already used with a different message" }
      });
    await request(createTestApp({
      createMessage: async () => ({ status: "rate_limited", retryAfterSeconds: 7 })
    })).post(`/api/rooms/${roomId}/messages`).send(body).expect("Retry-After", "7").expect(429, {
      error: { code: "MESSAGE_RATE_LIMITED", message: "Message rate limit exceeded", retryAfterSeconds: 7 }
    });
    await request(createTestApp({ createMessage: async () => ({ status: "unavailable" }) }))
      .post(`/api/rooms/${roomId}/messages`).send(body).expect(503, {
        error: {
          code: "MESSAGE_RATE_LIMIT_UNAVAILABLE",
          message: "Message sending is temporarily unavailable",
          retryable: true
        }
      });
  });

  it("publishes only a newly persisted message and keeps HTTP success independent from delivery", async () => {
    const publishMessageCreated = jest.fn();
    const messageEvents = { publishMessageCreated };
    await request(createTestApp({
      createMessage: async () => ({ status: "created", message: responseMessage })
    }, true, messageEvents)).post(`/api/rooms/${roomId}/messages`)
      .send({ body: record.body, clientRequestId })
      .expect(201, responseMessage);
    expect(publishMessageCreated).toHaveBeenCalledTimes(1);
    expect(publishMessageCreated).toHaveBeenCalledWith({
      message: {
        id: responseMessage.id,
        roomId: responseMessage.roomId,
        body: responseMessage.body,
        createdAt: responseMessage.createdAt,
        author: responseMessage.author
      },
      clientRequestId
    });

    await request(createTestApp({
      createMessage: async () => ({ status: "replayed", message: responseMessage })
    }, true, messageEvents)).post(`/api/rooms/${roomId}/messages`)
      .send({ body: record.body, clientRequestId })
      .expect(200, responseMessage);
    expect(publishMessageCreated).toHaveBeenCalledTimes(1);

    await request(createTestApp({
      createMessage: async () => ({ status: "created", message: responseMessage })
    }, true, { publishMessageCreated: () => { throw new Error("no connected transport"); } }))
      .post(`/api/rooms/${roomId}/messages`)
      .send({ body: record.body, clientRequestId })
      .expect(201, responseMessage);
  });
});

describe("message creation service and repository", () => {
  function fixture(
    existing: MessageCreateRecord | null,
    persisted = { created: true, message: record },
    roomExists = true,
    rateResult: Awaited<ReturnType<WriteRateLimiter["consume"]>> = { status: "allowed", remaining: 29 }
  ) {
    const repository: MessageCreateRepository = {
      roomExists: jest.fn(async () => roomExists),
      findByAuthorRequest: jest.fn(async () => existing),
      createOrFindAfterConflict: jest.fn(async () => persisted)
    };
    const limiter: WriteRateLimiter = { consume: jest.fn(async () => rateResult) };
    return { repository, limiter, service: createMessageCreateService(repository, limiter) };
  }

  it("replays or conflicts before room/Redis work using normalized body and room identity", async () => {
    const replay = fixture(record);
    await expect(replay.service.createMessage(authorId, roomId, { body: record.body, clientRequestId }))
      .resolves.toEqual({ status: "replayed", message: responseMessage });
    expect(replay.repository.roomExists).not.toHaveBeenCalled();
    expect(replay.limiter.consume).not.toHaveBeenCalled();

    for (const [requestedRoomId, body] of [[otherRoomId, record.body], [roomId, "Changed body"]] as const) {
      const conflict = fixture(record);
      await expect(conflict.service.createMessage(authorId, requestedRoomId, { body, clientRequestId }))
        .resolves.toEqual({ status: "conflict" });
      expect(conflict.limiter.consume).not.toHaveBeenCalled();
    }
  });

  it("checks the room, consumes the message limiter, and persists only server-derived fields", async () => {
    const missing = fixture(null, undefined, false);
    await expect(missing.service.createMessage(authorId, roomId, { body: record.body, clientRequestId }))
      .resolves.toEqual({ status: "room_not_found" });
    expect(missing.limiter.consume).not.toHaveBeenCalled();

    const created = fixture(null);
    await expect(created.service.createMessage(authorId, roomId, { body: record.body, clientRequestId }))
      .resolves.toEqual({ status: "created", message: responseMessage });
    expect(created.limiter.consume).toHaveBeenCalledWith("message", authorId);
    expect(created.repository.createOrFindAfterConflict).toHaveBeenCalledWith({
      roomId, authorId, body: record.body, clientRequestId
    });
  });

  it("fails closed, bounds retry timing, and validates a raced canonical row", async () => {
    const unavailable = fixture(null, undefined, true, { status: "unavailable", retryable: true });
    await expect(unavailable.service.createMessage(authorId, roomId, { body: record.body, clientRequestId }))
      .resolves.toEqual({ status: "unavailable" });
    expect(unavailable.repository.createOrFindAfterConflict).not.toHaveBeenCalled();

    const exceeded = fixture(null, undefined, true, { status: "exceeded", retryAfterSeconds: 9_999 });
    await expect(exceeded.service.createMessage(authorId, roomId, { body: record.body, clientRequestId }))
      .resolves.toEqual({ status: "rate_limited", retryAfterSeconds: 3600 });
    expect(exceeded.repository.createOrFindAfterConflict).not.toHaveBeenCalled();

    const racedConflict = fixture(null, { created: false, message: { ...record, roomId: otherRoomId } });
    await expect(racedConflict.service.createMessage(authorId, roomId, { body: record.body, clientRequestId }))
      .resolves.toEqual({ status: "conflict" });
  });

  it("selects only approved response fields and recovers the canonical row after a unique race", async () => {
    const findUnique = jest.fn(async () => record);
    const create = jest.fn(async () => { throw { code: "P2002" }; });
    const repository = createPrismaMessageCreateRepository({
      room: { findUnique: jest.fn(async () => ({ id: roomId })) },
      message: { findUnique, create }
    });
    await expect(repository.createOrFindAfterConflict({ roomId, authorId, body: record.body, clientRequestId }))
      .resolves.toEqual({ created: false, message: record });
    expect(create).toHaveBeenCalledWith({
      data: { roomId, authorId, body: record.body, clientRequestId },
      select: {
        id: true,
        roomId: true,
        body: true,
        createdAt: true,
        author: { select: { name: true, image: true } },
        authorId: true,
        clientRequestId: true
      }
    });
    expect(JSON.stringify(responseMessage)).not.toMatch(/authorId|email|session|account/i);

    const failure = new Error("database unavailable");
    const failing = createPrismaMessageCreateRepository({
      room: { findUnique: jest.fn(async () => ({ id: roomId })) },
      message: {
        findUnique: jest.fn(async () => null),
        create: jest.fn(async () => { throw failure; })
      }
    });
    await expect(failing.createOrFindAfterConflict({
      roomId, authorId, body: record.body, clientRequestId: randomUUID()
    })).rejects.toBe(failure);
  });
});
