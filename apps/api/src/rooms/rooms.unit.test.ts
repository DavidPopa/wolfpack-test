import request from "supertest";
import { ZodError } from "zod";
import { createApp } from "../app.js";
import { createPrismaRoomReadRepository, type RoomListRecord } from "./repository.js";
import { createRoomListService } from "./service.js";

const createdAt = new Date("2026-09-16T09:30:00.000Z");
const validRecord: RoomListRecord = {
  id: "9d90f18b-6e71-41e2-92de-a3f84f307743",
  title: "Fixture room",
  latitude: 44.4268,
  longitude: 26.1025,
  createdAt
};

describe("public room listing", () => {
  it("queries only public fields in stable database order", async () => {
    const findMany = jest.fn(async () => [validRecord]);
    const repository = createPrismaRoomReadRepository({ room: { findMany } });

    await expect(repository.listPublicRooms()).resolves.toEqual([validRecord]);
    expect(findMany).toHaveBeenCalledWith({
      select: { id: true, title: true, latitude: true, longitude: true, createdAt: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }]
    });
  });

  it("returns the exact browser-safe contract without consulting auth", async () => {
    const resolveIdentity = jest.fn(async () => ({ userId: "should-not-be-used" }));
    const listPublicRooms = jest.fn(async () => [{
      id: validRecord.id,
      title: validRecord.title,
      latitude: validRecord.latitude,
      longitude: validRecord.longitude,
      createdAt: createdAt.toISOString()
    }]);
    const app = createApp({
      auth: {
        handler: (_request, response) => response.sendStatus(500),
        resolveIdentity
      },
      probes: { postgres: async () => true, redis: async () => true },
      readinessTimeoutMs: 50,
      rooms: { listPublicRooms }
    });

    await request(app).get("/api/rooms").expect(200, [{
      id: validRecord.id,
      title: "Fixture room",
      latitude: 44.4268,
      longitude: 26.1025,
      createdAt: "2026-09-16T09:30:00.000Z"
    }]);
    expect(resolveIdentity).not.toHaveBeenCalled();
    expect(listPublicRooms).toHaveBeenCalledTimes(1);
  });

  it("validates the fully serialized response and rejects invalid persistence output", async () => {
    const service = createRoomListService({
      listPublicRooms: async () => [{ ...validRecord, longitude: 181 }]
    });

    await expect(service.listPublicRooms()).rejects.toBeInstanceOf(ZodError);
  });

  it("drops persistence-only fields before validating the public response", async () => {
    const service = createRoomListService({
      listPublicRooms: async () => [{
        ...validRecord,
        creatorId: "private-creator",
        creator: { email: "private@example.invalid" }
      }]
    });

    await expect(service.listPublicRooms()).resolves.toEqual([{
      id: validRecord.id,
      title: validRecord.title,
      latitude: validRecord.latitude,
      longitude: validRecord.longitude,
      createdAt: createdAt.toISOString()
    }]);
  });
});
