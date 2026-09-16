import {
  roomCreateResponseSchema,
  roomListResponseSchema,
  type RoomCreateRequest,
  type RoomCreateResponse,
  type RoomListResponse
} from "@map-chat/contracts";
import type { WriteRateLimiter } from "../rate-limit/index.js";
import type { RoomCreateRecord, RoomCreateRepository, RoomReadRepository } from "./repository.js";

export interface RoomListService {
  listPublicRooms: () => Promise<RoomListResponse>;
}

export type CreateRoomResult =
  | { status: "created" | "replayed"; room: RoomCreateResponse }
  | { status: "conflict" }
  | { status: "rate_limited"; retryAfterSeconds: number }
  | { status: "unavailable" };

export interface RoomCreateService {
  createRoom: (creatorId: string, request: RoomCreateRequest) => Promise<CreateRoomResult>;
}

function matchesRequest(room: RoomCreateRecord, request: RoomCreateRequest): boolean {
  return room.latitude === request.latitude && room.longitude === request.longitude;
}

function serializeCreatedRoom(room: RoomCreateRecord): RoomCreateResponse {
  return roomCreateResponseSchema.parse({
    id: room.id,
    title: room.title,
    latitude: room.latitude,
    longitude: room.longitude,
    createdAt: room.createdAt.toISOString(),
    clientRequestId: room.clientRequestId
  });
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

export function createRoomCreateService(
  repository: RoomCreateRepository,
  rateLimiter: WriteRateLimiter
): RoomCreateService {
  return {
    async createRoom(creatorId, request) {
      const existing = await repository.findByCreatorRequest(creatorId, request.clientRequestId);
      if (existing) {
        return matchesRequest(existing, request)
          ? { status: "replayed", room: serializeCreatedRoom(existing) }
          : { status: "conflict" };
      }

      const rateLimit = await rateLimiter.consume("room", creatorId);
      if (rateLimit.status === "unavailable") return { status: "unavailable" };
      if (rateLimit.status === "exceeded") {
        return {
          status: "rate_limited",
          retryAfterSeconds: Math.min(3600, Math.max(1, Math.trunc(rateLimit.retryAfterSeconds)))
        };
      }

      const persisted = await repository.createOrFindAfterConflict({
        title: `Room at ${request.latitude.toFixed(4)}, ${request.longitude.toFixed(4)}`,
        latitude: request.latitude,
        longitude: request.longitude,
        creatorId,
        clientRequestId: request.clientRequestId
      });
      if (!persisted.created && !matchesRequest(persisted.room, request)) return { status: "conflict" };
      return {
        status: persisted.created ? "created" : "replayed",
        room: serializeCreatedRoom(persisted.room)
      };
    }
  };
}
