import {
  messageCreatedEventPayloadSchema,
  messageRoomSubscriptionSchema,
  type MessageCreatedEventPayload
} from "@map-chat/contracts";
import type { Socket } from "socket.io";
import type {
  ClientToServerEvents,
  InterServerEvents,
  RoomSocketServer,
  ServerToClientEvents,
  SocketData
} from "../rooms/events.js";

export const MESSAGE_SUBSCRIBE_EVENT = "message.subscribe";
export const MESSAGE_UNSUBSCRIBE_EVENT = "message.unsubscribe";
export const MESSAGE_CREATED_EVENT = "message.created";
const MESSAGE_ROOM_PREFIX = "message-room:";

type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

export interface MessageEventPublisher {
  publishMessageCreated: (payload: MessageCreatedEventPayload) => void;
}

export interface BindableMessageEventPublisher extends MessageEventPublisher {
  bind: (io: RoomSocketServer) => void;
}

export const disabledMessageEventPublisher: MessageEventPublisher = {
  publishMessageCreated: () => undefined
};

export function messageRoomChannel(roomId: string): string {
  return `${MESSAGE_ROOM_PREFIX}${roomId}`;
}

function bindMessageSubscriptions(socket: AppSocket): void {
  let transition = Promise.resolve();
  const enqueue = (operation: () => Promise<void>) => {
    transition = transition.then(operation, operation).catch(() => undefined);
  };

  socket.on(MESSAGE_SUBSCRIBE_EVENT, (payload) => {
    const parsed = messageRoomSubscriptionSchema.safeParse(payload);
    if (!parsed.success) return;
    enqueue(async () => {
      if (!socket.connected || socket.data.messageRoomId === parsed.data.roomId) return;
      const previousRoomId = socket.data.messageRoomId;
      if (previousRoomId) await socket.leave(messageRoomChannel(previousRoomId));
      if (!socket.connected) {
        delete socket.data.messageRoomId;
        return;
      }
      await socket.join(messageRoomChannel(parsed.data.roomId));
      socket.data.messageRoomId = parsed.data.roomId;
    });
  });

  socket.on(MESSAGE_UNSUBSCRIBE_EVENT, (payload) => {
    const parsed = messageRoomSubscriptionSchema.safeParse(payload);
    if (!parsed.success) return;
    enqueue(async () => {
      if (socket.data.messageRoomId !== parsed.data.roomId) return;
      await socket.leave(messageRoomChannel(parsed.data.roomId));
      delete socket.data.messageRoomId;
    });
  });
}

export function createSocketMessageEventPublisher(): BindableMessageEventPublisher {
  let io: RoomSocketServer | undefined;
  return {
    bind(socketServer) {
      io = socketServer;
      socketServer.on("connection", bindMessageSubscriptions);
    },
    publishMessageCreated(payload) {
      const parsed = messageCreatedEventPayloadSchema.parse(payload);
      io?.to(messageRoomChannel(parsed.message.roomId)).emit(MESSAGE_CREATED_EVENT, parsed);
    }
  };
}
