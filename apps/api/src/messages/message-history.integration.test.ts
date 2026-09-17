import { randomUUID } from "node:crypto";
import request from "supertest";
import { createApp } from "../app.js";
import { createPrismaClient } from "../prisma.js";
import { createPrismaMessageReadRepository } from "./repository.js";
import { createMessageHistoryService } from "./service.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("TEST_DATABASE_URL is required for message history integration tests");

describe("GET /api/rooms/:roomId/messages with PostgreSQL", () => {
  const prisma = createPrismaClient(databaseUrl);
  const ownedUserIds = new Set<string>();
  const ownedRoomIds = new Set<string>();
  const ownedMessageIds = new Set<string>();
  let identityLookupCount = 0;
  const resolveIdentity = async () => {
    identityLookupCount += 1;
    return { userId: "unexpected-auth-lookup" };
  };
  const app = createApp({
    auth: { handler: (_request, response) => response.sendStatus(500), resolveIdentity },
    probes: { postgres: async () => true, redis: async () => true },
    readinessTimeoutMs: 100,
    rooms: { listPublicRooms: async () => [] },
    roomCreation: { createRoom: async () => ({ status: "unavailable" }) },
    messages: createMessageHistoryService(createPrismaMessageReadRepository(prisma))
  });

  async function createUser(name: string, image: string | null = null): Promise<string> {
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

  async function createRoom(): Promise<string> {
    const creatorId = await createUser("Room creator");
    const id = randomUUID();
    ownedRoomIds.add(id);
    await prisma.room.create({
      data: {
        id,
        title: "Message history fixture",
        latitude: 44.4268,
        longitude: 26.1025,
        creatorId,
        clientRequestId: randomUUID()
      }
    });
    return id;
  }

  beforeAll(async () => prisma.$connect());
  afterEach(async () => {
    const messageIds = [...ownedMessageIds];
    const roomIds = [...ownedRoomIds];
    const userIds = [...ownedUserIds];
    if (messageIds.length) await prisma.message.deleteMany({ where: { id: { in: messageIds } } });
    if (roomIds.length) await prisma.room.deleteMany({ where: { id: { in: roomIds } } });
    if (userIds.length) await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    expect(await prisma.message.count({ where: { id: { in: messageIds } } })).toBe(0);
    expect(await prisma.room.count({ where: { id: { in: roomIds } } })).toBe(0);
    expect(await prisma.user.count({ where: { id: { in: userIds } } })).toBe(0);
    ownedMessageIds.clear();
    ownedRoomIds.clear();
    ownedUserIds.clear();
    identityLookupCount = 0;
  });
  afterAll(async () => prisma.$disconnect());

  it("distinguishes an unknown room from an existing empty room without auth or Redis", async () => {
    await request(app).get(`/api/rooms/${randomUUID()}/messages`).expect(404, {
      error: { code: "ROOM_NOT_FOUND", message: "Room not found" }
    });
    const emptyRoomId = await createRoom();
    await request(app).get(`/api/rooms/${emptyRoomId}/messages`).expect(200, {
      messages: [],
      pageInfo: { startCursor: null, endCursor: null, hasOlder: false, hasNewer: false }
    });
    expect(identityLookupCount).toBe(0);
  });

  it("walks newest and repeated older pages chronologically across equal timestamps", async () => {
    const fixture = await seedMessages();
    const newest = await request(app).get(`/api/rooms/${fixture.roomId}/messages?limit=2`).expect(200);
    expectPage(newest.body, fixture.ids.slice(5, 7), true, false);

    const pages = [newest.body];
    while (pages.at(-1).pageInfo.hasOlder) {
      const page = await request(app)
        .get(`/api/rooms/${fixture.roomId}/messages?limit=2&before=${pages.at(-1).pageInfo.startCursor}`)
        .expect(200);
      pages.push(page.body);
    }
    expect([...pages].reverse().flatMap((page) => page.messages.map((message: { id: string }) => message.id)))
      .toEqual(fixture.ids);
    expect(pages.at(-1).pageInfo).toMatchObject({ hasOlder: false, hasNewer: true });
    expect(identityLookupCount).toBe(0);
  });

  it("walks repeated newer pages from a known end cursor without gaps, duplicates, or private identity", async () => {
    const fixture = await seedMessages();
    const initial = await request(app).get(`/api/rooms/${fixture.roomId}/messages?limit=100`).expect(200);
    const firstId = initial.body.messages[0].id as string;
    const startCursor = initial.body.pageInfo.startCursor as string;

    const collected = [firstId];
    let after = startCursor;
    let hasNewer = true;
    while (hasNewer) {
      const page = await request(app)
        .get(`/api/rooms/${fixture.roomId}/messages?limit=2&after=${after}`)
        .expect(200);
      collected.push(...page.body.messages.map((message: { id: string }) => message.id));
      hasNewer = page.body.pageInfo.hasNewer;
      if (page.body.pageInfo.endCursor) after = page.body.pageInfo.endCursor;
      expect(page.body.pageInfo.hasOlder).toBe(true);
    }
    expect(collected).toEqual(fixture.ids);
    expect(new Set(collected).size).toBe(fixture.ids.length);

    const finalPage = await request(app).get(`/api/rooms/${fixture.roomId}/messages?limit=100`).expect(200);
    expect(finalPage.body.messages).toHaveLength(7);
    expect(Object.keys(finalPage.body.messages[0]).sort()).toEqual(["author", "body", "createdAt", "id", "roomId"]);
    expect(Object.keys(finalPage.body.messages[0].author).sort()).toEqual(["image", "name"]);
    expect(JSON.stringify(finalPage.body)).not.toMatch(/authorId|email|clientRequestId|session/i);
  });

  it("rejects a canonical cursor that is not an exact edge in the requested room", async () => {
    const first = await seedMessages();
    const secondRoomId = await createRoom();
    const page = await request(app).get(`/api/rooms/${first.roomId}/messages?limit=1`).expect(200);
    await request(app)
      .get(`/api/rooms/${secondRoomId}/messages?after=${page.body.pageInfo.endCursor}`)
      .expect(400, {
        error: { code: "INVALID_MESSAGE_HISTORY_REQUEST", message: "Invalid message history request" }
      });
  });

  function expectPage(
    page: { messages: Array<{ id: string }>; pageInfo: { hasOlder: boolean; hasNewer: boolean } },
    expectedIds: string[],
    hasOlder: boolean,
    hasNewer: boolean
  ) {
    expect(page.messages.map((message) => message.id)).toEqual(expectedIds);
    expect(page.pageInfo).toMatchObject({ hasOlder, hasNewer });
  }

  async function seedMessages(): Promise<{ roomId: string; ids: string[] }> {
    const roomId = await createRoom();
    const authorId = await createUser("Public author", "https://example.invalid/avatar.png");
    const ids = [
      "10000000-0000-4000-8000-000000000001",
      "10000000-0000-4000-8000-000000000002",
      "20000000-0000-4000-8000-000000000003",
      "10000000-0000-4000-8000-000000000004",
      "10000000-0000-4000-8000-000000000005",
      "20000000-0000-4000-8000-000000000006",
      "10000000-0000-4000-8000-000000000007"
    ];
    ids.forEach((id) => ownedMessageIds.add(id));
    const timestamps = [
      "2026-09-17T08:00:00.000Z",
      "2026-09-17T08:01:00.000Z",
      "2026-09-17T08:01:00.000Z",
      "2026-09-17T08:02:00.000Z",
      "2026-09-17T08:03:00.000Z",
      "2026-09-17T08:03:00.000Z",
      "2026-09-17T08:04:00.000Z"
    ];
    await prisma.message.createMany({
      data: ids.map((id, index) => ({
        id,
        roomId,
        authorId,
        body: `Message ${index + 1}`,
        clientRequestId: randomUUID(),
        createdAt: new Date(timestamps[index]!)
      }))
    });
    return { roomId, ids };
  }
});
