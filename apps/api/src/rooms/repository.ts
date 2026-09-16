export interface RoomListRecord {
  id: string;
  title: string;
  latitude: number;
  longitude: number;
  createdAt: Date;
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

const publicRoomSelect = {
  id: true,
  title: true,
  latitude: true,
  longitude: true,
  createdAt: true
} as const;

export function createPrismaRoomReadRepository(prisma: RoomReadPrismaClient): RoomReadRepository {
  return {
    listPublicRooms: () => prisma.room.findMany({
      select: publicRoomSelect,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }]
    })
  };
}
