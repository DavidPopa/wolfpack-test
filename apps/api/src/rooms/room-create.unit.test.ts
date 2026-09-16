import { randomUUID } from "node:crypto";
import { roomCreateRequestSchema } from "@map-chat/contracts";
import request from "supertest";
import { ZodError } from "zod";
import { createApp } from "../app.js";
import type { WriteRateLimiter } from "../rate-limit/index.js";
import {
  createPrismaRoomCreateRepository,
  type RoomCreateRecord,
  type RoomCreateRepository
} from "./repository.js";
import { createRoomCreateService, type RoomCreateService } from "./service.js";

const creatorId = "creator-fixture";
const clientRequestId = "5d6647f5-6d1e-4d34-8353-0388687cbfc1";
const createdAt = new Date("2026-09-16T10:00:00.000Z");
const record: RoomCreateRecord = {
  id: "e557f4c5-3506-4fa7-9c3e-df62f7751e44",
  title: "Room at 44.4268, 26.1025",
  latitude: 44.4268,
  longitude: 26.1025,
  creatorId,
  clientRequestId,
  createdAt
};
const responseRoom = {
  id: record.id,
  title: record.title,
  latitude: record.latitude,
  longitude: record.longitude,
  createdAt: createdAt.toISOString(),
  clientRequestId
};

function createTestApp(roomCreation: RoomCreateService, authenticated = true) {
  return createApp({
    auth: {
      handler: (_request, response) => response.sendStatus(500),
      resolveIdentity: async () => authenticated ? { userId: creatorId } : null
    },
    probes: { postgres: async () => true, redis: async () => true },
    readinessTimeoutMs: 50,
    rooms: { listPublicRooms: async () => [] },
    roomCreation
  });
}

describe("room create contracts and HTTP route", () => {
  it("canonicalizes negative zero and rejects non-finite, out-of-range, non-UUID, and unknown input", () => {
    const parsed = roomCreateRequestSchema.parse({ latitude: -0, longitude: -0, clientRequestId });
    expect(Object.is(parsed.latitude, -0)).toBe(false);
    expect(Object.is(parsed.longitude, -0)).toBe(false);
    for (const body of [
      { latitude: Number.NaN, longitude: 0, clientRequestId },
      { latitude: 91, longitude: 0, clientRequestId },
      { latitude: 0, longitude: -181, clientRequestId },
      { latitude: 0, longitude: 0, clientRequestId: "not-a-uuid" },
      { latitude: 0, longitude: 0, clientRequestId, creatorId },
      { latitude: 0, longitude: 0, clientRequestId, title: "Client title" }
    ]) expect(roomCreateRequestSchema.safeParse(body).success).toBe(false);
  });

  it("returns 401 before parsing or invoking room creation for a guest", async () => {
    const createRoom: RoomCreateService["createRoom"] = jest.fn();
    await request(createTestApp({ createRoom }, false))
      .post("/api/rooms")
      .send({ latitude: 999, longitude: 0, clientRequestId: "bad" })
      .expect(401, { error: { code: "UNAUTHORIZED", message: "Authentication required" } });
    expect(createRoom).not.toHaveBeenCalled();
  });

  it("returns 400 for a strict invalid request", async () => {
    const createRoom: RoomCreateService["createRoom"] = jest.fn();
    await request(createTestApp({ createRoom }))
      .post("/api/rooms")
      .send({ latitude: 44, longitude: 26, clientRequestId, title: "forbidden" })
      .expect(400, { error: { code: "INVALID_ROOM_REQUEST", message: "Invalid room request" } });
    expect(createRoom).not.toHaveBeenCalled();
  });

  it.each([
    ["created", 201],
    ["replayed", 200]
  ] as const)("returns the exact public response for %s", async (status, expectedStatus) => {
    const createRoom = jest.fn(async () => ({ status, room: responseRoom } as const));
    await request(createTestApp({ createRoom }))
      .post("/api/rooms")
      .send({ latitude: 44.4268, longitude: 26.1025, clientRequestId })
      .expect(expectedStatus, responseRoom);
    expect(createRoom).toHaveBeenCalledWith(creatorId, {
      latitude: 44.4268, longitude: 26.1025, clientRequestId
    });
  });

  it("maps conflict, rate limiting, and limiter outage to stable errors", async () => {
    const body = { latitude: 44.4268, longitude: 26.1025, clientRequestId };
    await request(createTestApp({ createRoom: async () => ({ status: "conflict" }) }))
      .post("/api/rooms").send(body).expect(409, {
        error: { code: "ROOM_REQUEST_CONFLICT", message: "Request ID already used with different coordinates" }
      });
    await request(createTestApp({ createRoom: async () => ({ status: "rate_limited", retryAfterSeconds: 7 }) }))
      .post("/api/rooms").send(body).expect("Retry-After", "7").expect(429, {
        error: { code: "ROOM_RATE_LIMITED", message: "Room creation rate limit exceeded", retryAfterSeconds: 7 }
      });
    await request(createTestApp({ createRoom: async () => ({ status: "unavailable" }) }))
      .post("/api/rooms").send(body).expect(503, {
        error: {
          code: "ROOM_RATE_LIMIT_UNAVAILABLE",
          message: "Room creation is temporarily unavailable",
          retryable: true
        }
      });
  });
});

describe("room creation service", () => {
  function fixture(
    existing: RoomCreateRecord | null,
    persisted = { created: true, room: record },
    rateResult: Awaited<ReturnType<WriteRateLimiter["consume"]>> = { status: "allowed", remaining: 4 }
  ) {
    const repository: RoomCreateRepository = {
      findByCreatorRequest: jest.fn(async () => existing),
      createOrFindAfterConflict: jest.fn(async () => persisted)
    };
    const limiter: WriteRateLimiter = { consume: jest.fn(async () => rateResult) };
    return { repository, limiter, service: createRoomCreateService(repository, limiter) };
  }

  it("returns an identical pre-existing replay without consuming rate capacity", async () => {
    const { repository, limiter, service } = fixture(record);
    await expect(service.createRoom(creatorId, { latitude: 44.4268, longitude: 26.1025, clientRequestId }))
      .resolves.toEqual({ status: "replayed", room: responseRoom });
    expect(limiter.consume).not.toHaveBeenCalled();
    expect(repository.createOrFindAfterConflict).not.toHaveBeenCalled();
  });

  it("returns a pre-existing payload conflict without consuming rate capacity", async () => {
    const { repository, limiter, service } = fixture(record);
    await expect(service.createRoom(creatorId, { latitude: 45, longitude: 26.1025, clientRequestId }))
      .resolves.toEqual({ status: "conflict" });
    expect(limiter.consume).not.toHaveBeenCalled();
    expect(repository.createOrFindAfterConflict).not.toHaveBeenCalled();
  });

  it("derives creator and locale-independent title and persists full coordinate precision", async () => {
    const preciseRecord = { ...record, title: "Room at 12.3457, -98.7654", latitude: 12.3456789, longitude: -98.7654321 };
    const { repository, limiter, service } = fixture(null, { created: true, room: preciseRecord });
    await expect(service.createRoom(creatorId, {
      latitude: 12.3456789, longitude: -98.7654321, clientRequestId
    })).resolves.toMatchObject({ status: "created", room: { latitude: 12.3456789, longitude: -98.7654321 } });
    expect(limiter.consume).toHaveBeenCalledWith("room", creatorId);
    expect(repository.createOrFindAfterConflict).toHaveBeenCalledWith({
      title: "Room at 12.3457, -98.7654",
      latitude: 12.3456789,
      longitude: -98.7654321,
      creatorId,
      clientRequestId
    });
  });

  it("fails closed without persistence and bounds exceeded retry timing", async () => {
    const unavailable = fixture(null, undefined, { status: "unavailable", retryable: true });
    await expect(unavailable.service.createRoom(creatorId, { latitude: 0, longitude: 0, clientRequestId }))
      .resolves.toEqual({ status: "unavailable" });
    expect(unavailable.repository.createOrFindAfterConflict).not.toHaveBeenCalled();

    const exceeded = fixture(null, undefined, { status: "exceeded", retryAfterSeconds: 9_999 });
    await expect(exceeded.service.createRoom(creatorId, { latitude: 0, longitude: 0, clientRequestId }))
      .resolves.toEqual({ status: "rate_limited", retryAfterSeconds: 3600 });
    expect(exceeded.repository.createOrFindAfterConflict).not.toHaveBeenCalled();
  });

  it("uses the canonical row after a unique-constraint race and validates persistence output", async () => {
    const findUnique = jest.fn(async () => record);
    const create = jest.fn(async () => { throw { code: "P2002" }; });
    const repository = createPrismaRoomCreateRepository({ room: { findUnique, create } });
    await expect(repository.createOrFindAfterConflict({
      title: record.title,
      latitude: record.latitude,
      longitude: record.longitude,
      creatorId,
      clientRequestId
    })).resolves.toEqual({ created: false, room: record });

    const invalid = fixture({ ...record, longitude: 181 });
    await expect(invalid.service.createRoom(creatorId, {
      latitude: record.latitude, longitude: 181, clientRequestId
    })).rejects.toBeInstanceOf(ZodError);
  });

  it("does not mistake unrelated persistence failures for an idempotency race", async () => {
    const failure = new Error("database unavailable");
    const repository = createPrismaRoomCreateRepository({
      room: {
        findUnique: jest.fn(async () => null),
        create: jest.fn(async () => { throw failure; })
      }
    });
    await expect(repository.createOrFindAfterConflict({
      title: record.title,
      latitude: record.latitude,
      longitude: record.longitude,
      creatorId,
      clientRequestId: randomUUID()
    })).rejects.toBe(failure);
  });
});
