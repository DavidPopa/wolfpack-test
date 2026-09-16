import { roomListResponseSchema, type RoomListResponse } from "@map-chat/contracts";
import type { RoomReadRepository } from "./repository.js";

export interface RoomListService {
  listPublicRooms: () => Promise<RoomListResponse>;
}

export function createRoomListService(repository: RoomReadRepository): RoomListService {
  return {
    async listPublicRooms() {
      const rooms = await repository.listPublicRooms();
      return roomListResponseSchema.parse(rooms.map((room) => ({
        id: room.id,
        title: room.title,
        latitude: room.latitude,
        longitude: room.longitude,
        createdAt: room.createdAt.toISOString()
      })));
    }
  };
}
