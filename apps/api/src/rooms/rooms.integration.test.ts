import { randomUUID } from "node:crypto";
import request from "supertest";
import { createApp } from "../app.js";
import { createPrismaClient } from "../prisma.js";
import { createPrismaRoomReadRepository } from "./repository.js";
import { createRoomListService } from "./service.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("TEST_DATABASE_URL is required for room list integration tests");

describe("GET /api/rooms with PostgreSQL", () => {
  const prisma = createPrismaClient(databaseUrl);
  const ownedRoomIds: string[] = [];
  const ownedUserIds: string[] = [];
  let identityLookupCount = 0;
  const resolveIdentity = async () => {
    identityLookupCount += 1;
    return { userId: "unexpected-auth-lookup" };
  };
  const app = createApp({
    auth: {
      handler: (_request, response) => response.sendStatus(500),
      resolveIdentity
    },
    probes: { postgres: async () => true, redis: async () => true },
    readinessTimeoutMs: 100,
    rooms: createRoomListService(createPrismaRoomReadRepository(prisma))
  });

  beforeAll(async () => prisma.$connect());
  afterEach(async () => {
    const roomIds = ownedRoomIds.splice(0);
    const userIds = ownedUserIds.splice(0);
    if (roomIds.length) await prisma.room.deleteMany({ where: { id: { in: roomIds } } });
    if (userIds.length) await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    expect(await prisma.room.count({ where: { id: { in: roomIds } } })).toBe(0);
    expect(await prisma.user.count({ where: { id: { in: userIds } } })).toBe(0);
    identityLookupCount = 0;
  });
  afterAll(async () => prisma.$disconnect());

  it("returns an empty array to a guest when the isolated database has no rooms", async () => {
    expect(await prisma.room.count()).toBe(0);
    await request(app).get("/api/rooms").expect(200, []);
    expect(identityLookupCount).toBe(0);
  });

  it("returns persisted rooms in createdAt then id order with exact public fields", async () => {
    expect(await prisma.room.count()).toBe(0);
    const creatorId = randomUUID();
    ownedUserIds.push(creatorId);
    await prisma.user.create({
      data: {
        id: creatorId,
        name: "Room list fixture",
        email: `${creatorId}@example.invalid`,
        emailVerified: true
      }
    });

    const earlierRoomId = "30000000-0000-4000-8000-000000000003";
    const tiedFirstRoomId = "10000000-0000-4000-8000-000000000001";
    const tiedSecondRoomId = "20000000-0000-4000-8000-000000000002";
    ownedRoomIds.push(earlierRoomId, tiedFirstRoomId, tiedSecondRoomId);
    const earlier = new Date("2026-09-16T08:00:00.000Z");
    const tied = new Date("2026-09-16T09:00:00.000Z");
    await prisma.room.createMany({
      data: [
        {
          id: tiedSecondRoomId,
          title: "Tied second",
          latitude: 44.44,
          longitude: 26.12,
          creatorId,
          clientRequestId: randomUUID(),
          createdAt: tied
        },
        {
          id: earlierRoomId,
          title: "Earlier",
          latitude: -90,
          longitude: -180,
          creatorId,
          clientRequestId: randomUUID(),
          createdAt: earlier
        },
        {
          id: tiedFirstRoomId,
          title: "Tied first",
          latitude: 90,
          longitude: 180,
          creatorId,
          clientRequestId: randomUUID(),
          createdAt: tied
        }
      ]
    });

    await request(app).get("/api/rooms").expect(200, [
      {
        id: earlierRoomId,
        title: "Earlier",
        latitude: -90,
        longitude: -180,
        createdAt: earlier.toISOString()
      },
      {
        id: tiedFirstRoomId,
        title: "Tied first",
        latitude: 90,
        longitude: 180,
        createdAt: tied.toISOString()
      },
      {
        id: tiedSecondRoomId,
        title: "Tied second",
        latitude: 44.44,
        longitude: 26.12,
        createdAt: tied.toISOString()
      }
    ]);
    expect(identityLookupCount).toBe(0);
  });
});
