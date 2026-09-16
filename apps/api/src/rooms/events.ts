import {
  roomCreatedEventPayloadSchema,
  type RoomCreatedEventPayload
} from "@map-chat/contracts";
import type { Server as SocketServer } from "socket.io";

export const ROOM_CREATED_EVENT = "room.created";

export type ClientToServerEvents = Record<never, never>;

export interface ServerToClientEvents {
  [ROOM_CREATED_EVENT]: (payload: RoomCreatedEventPayload) => void;
}

export type InterServerEvents = Record<never, never>;

export type SocketData = Record<string, never>;

export type RoomSocketServer = SocketServer<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

export interface RoomEventPublisher {
  publishRoomCreated: (payload: RoomCreatedEventPayload) => void;
}

export interface BindableRoomEventPublisher extends RoomEventPublisher {
  bind: (io: RoomSocketServer) => void;
}

export const disabledRoomEventPublisher: RoomEventPublisher = {
  publishRoomCreated: () => undefined
};

export function createSocketRoomEventPublisher(): BindableRoomEventPublisher {
  let io: RoomSocketServer | undefined;
  return {
    bind(socketServer) {
      io = socketServer;
    },
    publishRoomCreated(payload) {
      const parsed = roomCreatedEventPayloadSchema.parse(payload);
      io?.emit(ROOM_CREATED_EVENT, parsed);
    }
  };
}
