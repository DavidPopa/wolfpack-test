export interface RoomListRecord {
  id: string;
  title: string;
  latitude: number;
  longitude: number;
  createdAt: Date;
}

export interface RoomCreateRecord extends RoomListRecord {
  creatorId: string;
  clientRequestId: string;
}

export interface CreateRoomData {
  title: string;
  latitude: number;
  longitude: number;
  creatorId: string;
  clientRequestId: string;
}

export interface RoomReadPrismaClient {
  room: {
    findMany: (query: {
      select: {
        id: true;
        title: true;
        latitude: true;
        longitude: true;
        createdAt: true;
      };
      orderBy: [{ createdAt: "asc" }, { id: "asc" }];
    }) => Promise<RoomListRecord[]>;
  };
}

export interface RoomReadRepository {
  listPublicRooms: () => Promise<RoomListRecord[]>;
}

export interface RoomCreatePrismaClient {
  room: {
    findUnique: (query: {
      where: { creatorId_clientRequestId: { creatorId: string; clientRequestId: string } };
      select: typeof roomCreateSelect;
    }) => Promise<RoomCreateRecord | null>;
    create: (query: { data: CreateRoomData; select: typeof roomCreateSelect }) => Promise<RoomCreateRecord>;
  };
}

export interface RoomCreateRepository {
  findByCreatorRequest: (creatorId: string, clientRequestId: string) => Promise<RoomCreateRecord | null>;
  createOrFindAfterConflict: (data: CreateRoomData) => Promise<{ created: boolean; room: RoomCreateRecord }>;
}

const publicRoomSelect = {
  id: true,
  title: true,
  latitude: true,
  longitude: true,
  createdAt: true
} as const;

const roomCreateSelect = {
  ...publicRoomSelect,
  creatorId: true,
  clientRequestId: true
} as const;

function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

export function createPrismaRoomReadRepository(prisma: RoomReadPrismaClient): RoomReadRepository {
  return {
    listPublicRooms: () => prisma.room.findMany({
      select: publicRoomSelect,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }]
    })
  };
}

export function createPrismaRoomCreateRepository(prisma: RoomCreatePrismaClient): RoomCreateRepository {
  const findByCreatorRequest = (creatorId: string, clientRequestId: string) => prisma.room.findUnique({
    where: { creatorId_clientRequestId: { creatorId, clientRequestId } },
    select: roomCreateSelect
  });

  return {
    findByCreatorRequest,
    async createOrFindAfterConflict(data) {
      try {
        return {
          created: true,
          room: await prisma.room.create({ data, select: roomCreateSelect })
        };
      } catch (error) {
        if (!isUniqueConstraintError(error)) throw error;
        const existing = await findByCreatorRequest(data.creatorId, data.clientRequestId);
        if (!existing) throw error;
        return { created: false, room: existing };
      }
    }
  };
}
