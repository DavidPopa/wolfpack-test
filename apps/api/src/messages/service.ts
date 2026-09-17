import { messageHistoryResponseSchema, type MessageHistoryResponse } from "@map-chat/contracts";
import { encodeMessageCursor, type MessageCursor } from "./cursor.js";
import type { MessagePageDirection, MessageReadRepository } from "./repository.js";

export interface MessageHistoryRequest {
  limit: number;
  before?: MessageCursor;
  after?: MessageCursor;
}

export type MessageHistoryResult =
  | { status: "ok"; page: MessageHistoryResponse }
  | { status: "room_not_found" }
  | { status: "invalid_cursor" };

export interface MessageHistoryService {
  getHistory: (roomId: string, request: MessageHistoryRequest) => Promise<MessageHistoryResult>;
}

export const disabledMessageHistoryService: MessageHistoryService = {
  getHistory: async () => ({ status: "room_not_found" })
};

export function createMessageHistoryService(repository: MessageReadRepository): MessageHistoryService {
  return {
    async getHistory(roomId, request) {
      if (!(await repository.roomExists(roomId))) return { status: "room_not_found" };

      const cursor = request.before ?? request.after;
      if (cursor && !(await repository.cursorExists(roomId, cursor))) return { status: "invalid_cursor" };

      const direction: MessagePageDirection = request.before ? "before" : request.after ? "after" : "newest";
      const records = await repository.listPage({ roomId, direction, ...(cursor ? { cursor } : {}), limit: request.limit });
      const messages = records.messages.map((message) => ({
        id: message.id,
        roomId: message.roomId,
        body: message.body,
        createdAt: message.createdAt.toISOString(),
        author: { name: message.author.name, image: message.author.image }
      }));
      return {
        status: "ok",
        page: messageHistoryResponseSchema.parse({
          messages,
          pageInfo: {
            startCursor: records.messages[0]
              ? encodeMessageCursor({ createdAt: records.messages[0].createdAt, id: records.messages[0].id })
              : null,
            endCursor: records.messages.at(-1)
              ? encodeMessageCursor({ createdAt: records.messages.at(-1)!.createdAt, id: records.messages.at(-1)!.id })
              : null,
            hasOlder: records.hasOlder,
            hasNewer: records.hasNewer
          }
        })
      };
    }
  };
}
