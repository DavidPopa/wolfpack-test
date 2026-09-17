import { Buffer } from "node:buffer";
import {
  messageHistoryQuerySchema,
  messageHistoryResponseSchema,
  publicMessageSchema
} from "@map-chat/contracts";
import request from "supertest";
import { ZodError } from "zod";
import { createApp } from "../app.js";
import { decodeMessageCursor, encodeMessageCursor } from "./cursor.js";
import {
  createPrismaMessageReadRepository,
  type MessageReadRecord,
  type MessageReadRepository
} from "./repository.js";
import {
  createMessageHistoryService,
  type MessageHistoryResult,
  type MessageHistoryService
} from "./service.js";

const roomId = "10000000-0000-4000-8000-000000000001";
const messageId = "20000000-0000-4000-8000-000000000002";
const createdAt = new Date("2026-09-17T08:00:00.000Z");
const record: MessageReadRecord = {
  id: messageId,
  roomId,
  body: "Public fixture body",
  createdAt,
  author: { name: "Fixture author", image: null }
};

function createTestApp(messages: MessageHistoryService, resolveIdentity = jest.fn(async () => null)) {
  return {
    app: createApp({
      auth: { handler: (_request, response) => response.sendStatus(500), resolveIdentity },
      probes: { postgres: async () => true, redis: async () => true },
      readinessTimeoutMs: 50,
      rooms: { listPublicRooms: async () => [] },
      roomCreation: { createRoom: async () => ({ status: "unavailable" }) },
      messages
    }),
    resolveIdentity
  };
}

describe("message history contracts and cursors", () => {
  it("accepts only the strict privacy-safe public shape", () => {
    expect(publicMessageSchema.parse({
      id: messageId,
      roomId,
      body: record.body,
      createdAt: createdAt.toISOString(),
      author: { name: record.author.name, image: null }
    })).toEqual({
      id: messageId,
      roomId,
      body: record.body,
      createdAt: createdAt.toISOString(),
      author: { name: record.author.name, image: null }
    });
    expect(publicMessageSchema.safeParse({
      id: messageId,
      roomId,
      body: record.body,
      createdAt: createdAt.toISOString(),
      author: { name: record.author.name, image: null, email: "private@example.invalid" },
      authorId: "private-author"
    }).success).toBe(false);
    expect(messageHistoryResponseSchema.safeParse({
      messages: [],
      pageInfo: { startCursor: null, endCursor: null, hasOlder: false, hasNewer: false, extra: true }
    }).success).toBe(false);
  });

  it("parses the default/bounded integer limit and rejects ambiguous or unknown query fields", () => {
    expect(messageHistoryQuerySchema.parse({})).toEqual({ limit: 30 });
    expect(messageHistoryQuerySchema.parse({ limit: "100" })).toEqual({ limit: 100 });
    for (const query of [
      { limit: "0" },
      { limit: "101" },
      { limit: "1.5" },
      { limit: "01" },
      { limit: ["1", "2"] },
      { before: "token", after: "token" },
      { unexpected: "value" }
    ]) expect(messageHistoryQuerySchema.safeParse(query).success).toBe(false);
  });

  it("round-trips canonical opaque cursors and rejects malformed or non-canonical encodings", () => {
    const cursor = { createdAt, id: messageId };
    const token = encodeMessageCursor(cursor);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeMessageCursor(token)).toEqual(cursor);

    const nonCanonicalPayload = Buffer.from(JSON.stringify({
      id: messageId,
      createdAt: createdAt.toISOString(),
      version: 1
    })).toString("base64url");
    const nonCanonicalTimestamp = Buffer.from(JSON.stringify({
      version: 1,
      createdAt: "2026-09-17T08:00:00+00:00",
      id: messageId
    })).toString("base64url");
    for (const invalid of ["not-json", `${token}=`, nonCanonicalPayload, nonCanonicalTimestamp]) {
      expect(() => decodeMessageCursor(invalid)).toThrow("Invalid message cursor");
    }
  });
});

describe("message history repository and service", () => {
  it("selects only public fields and requests the indexed tuple order", async () => {
    const findMany = jest.fn(async () => [record]);
    const repository = createPrismaMessageReadRepository({
      room: { findUnique: jest.fn(async () => ({ id: roomId })) },
      message: { findFirst: jest.fn(async () => ({ id: messageId })), findMany }
    });
    await expect(repository.listPage({ roomId, direction: "newest", limit: 30 })).resolves.toEqual({
      messages: [record], hasOlder: false, hasNewer: false
    });
    expect(findMany).toHaveBeenCalledWith({
      where: { roomId },
      select: {
        id: true,
        roomId: true,
        body: true,
        createdAt: true,
        author: { select: { name: true, image: true } }
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 31
    });
  });

  it("serializes chronological output, creates edge cursors, and drops persistence-only fields", async () => {
    const earlier = { ...record, id: "10000000-0000-4000-8000-000000000001" };
    const repository: MessageReadRepository = {
      roomExists: jest.fn(async () => true),
      cursorExists: jest.fn(async () => true),
      listPage: jest.fn(async () => ({
        messages: [
          { ...earlier, authorId: "private", author: { ...earlier.author, email: "private@example.invalid" } },
          record
        ],
        hasOlder: true,
        hasNewer: false
      }))
    };
    const result = await createMessageHistoryService(repository).getHistory(roomId, { limit: 2 });
    expect(result).toEqual({
      status: "ok",
      page: {
        messages: [
          {
            id: earlier.id, roomId, body: earlier.body, createdAt: createdAt.toISOString(),
            author: { name: earlier.author.name, image: null }
          },
          {
            id: record.id, roomId, body: record.body, createdAt: createdAt.toISOString(),
            author: { name: record.author.name, image: null }
          }
        ],
        pageInfo: {
          startCursor: encodeMessageCursor({ createdAt, id: earlier.id }),
          endCursor: encodeMessageCursor({ createdAt, id: record.id }),
          hasOlder: true,
          hasNewer: false
        }
      }
    });
    expect(JSON.stringify(result)).not.toMatch(/authorId|email|session/i);
  });

  it("distinguishes unknown rooms and rejects cursors that are not exact edges in that room", async () => {
    const repository: MessageReadRepository = {
      roomExists: jest.fn(async () => false),
      cursorExists: jest.fn(async () => false),
      listPage: jest.fn()
    };
    const service = createMessageHistoryService(repository);
    await expect(service.getHistory(roomId, { limit: 30 })).resolves.toEqual({ status: "room_not_found" });
    expect(repository.cursorExists).not.toHaveBeenCalled();

    (repository.roomExists as jest.Mock).mockResolvedValue(true);
    await expect(service.getHistory(roomId, { limit: 30, after: { createdAt, id: messageId } }))
      .resolves.toEqual({ status: "invalid_cursor" });
    expect(repository.listPage).not.toHaveBeenCalled();
  });

  it("validates fully serialized persistence output", async () => {
    const service = createMessageHistoryService({
      roomExists: async () => true,
      cursorExists: async () => true,
      listPage: async () => ({ messages: [{ ...record, body: "" }], hasOlder: false, hasNewer: false })
    });
    await expect(service.getHistory(roomId, { limit: 30 })).rejects.toBeInstanceOf(ZodError);
  });
});

describe("GET /api/rooms/:roomId/messages", () => {
  it("is guest-readable without resolving a session", async () => {
    const getHistory = jest.fn(async (): Promise<MessageHistoryResult> => ({
      status: "ok",
      page: { messages: [], pageInfo: { startCursor: null, endCursor: null, hasOlder: false, hasNewer: false } }
    }));
    const { app, resolveIdentity } = createTestApp({ getHistory });
    await request(app).get(`/api/rooms/${roomId}/messages`).expect(200, {
      messages: [], pageInfo: { startCursor: null, endCursor: null, hasOlder: false, hasNewer: false }
    });
    expect(resolveIdentity).not.toHaveBeenCalled();
    expect(getHistory).toHaveBeenCalledWith(roomId, { limit: 30 });
  });

  it("returns stable errors for invalid params/query/cursors and unknown rooms", async () => {
    const getHistory = jest.fn(async () => ({ status: "room_not_found" } as const));
    const { app } = createTestApp({ getHistory });
    const invalidBody = { error: { code: "INVALID_MESSAGE_HISTORY_REQUEST", message: "Invalid message history request" } };
    for (const path of [
      "/api/rooms/not-a-uuid/messages",
      `/api/rooms/${roomId}/messages?limit=0`,
      `/api/rooms/${roomId}/messages?limit=101`,
      `/api/rooms/${roomId}/messages?unknown=1`,
      `/api/rooms/${roomId}/messages?before=token&after=token`,
      `/api/rooms/${roomId}/messages?after=not-json`
    ]) await request(app).get(path).expect(400, invalidBody);
    await request(app).get(`/api/rooms/${roomId}/messages`).expect(404, {
      error: { code: "ROOM_NOT_FOUND", message: "Room not found" }
    });
  });

  it("maps a canonical but foreign or missing edge to the stable invalid request", async () => {
    const getHistory = jest.fn(async () => ({ status: "invalid_cursor" } as const));
    const { app } = createTestApp({ getHistory });
    const cursor = encodeMessageCursor({ createdAt, id: messageId });
    await request(app).get(`/api/rooms/${roomId}/messages?after=${cursor}`).expect(400, {
      error: { code: "INVALID_MESSAGE_HISTORY_REQUEST", message: "Invalid message history request" }
    });
  });
});
