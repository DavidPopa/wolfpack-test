import {
  messageCreateResponseSchema,
  messageHistoryResponseSchema,
  type MessageCreateRequest,
  type MessageCreateResponse,
  type MessageHistoryResponse
} from "@map-chat/contracts";
import type { WriteRateLimiter } from "../rate-limit/index.js";
import { encodeMessageCursor, type MessageCursor } from "./cursor.js";
import type {
  MessageCreateRecord,
  MessageCreateRepository,
  MessagePageDirection,
  MessageReadRepository
} from "./repository.js";

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

export type CreateMessageResult =
  | { status: "created" | "replayed"; message: MessageCreateResponse }
  | { status: "room_not_found" }
  | { status: "conflict" }
  | { status: "rate_limited"; retryAfterSeconds: number }
  | { status: "unavailable" };

export interface MessageCreateService {
  createMessage: (
    authorId: string,
    roomId: string,
    request: MessageCreateRequest
  ) => Promise<CreateMessageResult>;
}

export const disabledMessageCreateService: MessageCreateService = {
  createMessage: async () => ({ status: "unavailable" })
};

function matchesCreateRequest(
  message: MessageCreateRecord,
  roomId: string,
  request: MessageCreateRequest
): boolean {
  return message.roomId === roomId && message.body === request.body;
}

function serializeCreatedMessage(message: MessageCreateRecord): MessageCreateResponse {
  return messageCreateResponseSchema.parse({
    id: message.id,
    roomId: message.roomId,
    body: message.body,
    createdAt: message.createdAt.toISOString(),
    author: { name: message.author.name, image: message.author.image },
    clientRequestId: message.clientRequestId
  });
}

export function createMessageCreateService(
  repository: MessageCreateRepository,
  rateLimiter: WriteRateLimiter
): MessageCreateService {
  return {
    async createMessage(authorId, roomId, request) {
      const existing = await repository.findByAuthorRequest(authorId, request.clientRequestId);
      if (existing) {
        return matchesCreateRequest(existing, roomId, request)
          ? { status: "replayed", message: serializeCreatedMessage(existing) }
          : { status: "conflict" };
      }

      if (!(await repository.roomExists(roomId))) return { status: "room_not_found" };

      const rateLimit = await rateLimiter.consume("message", authorId);
      if (rateLimit.status === "unavailable") return { status: "unavailable" };
      if (rateLimit.status === "exceeded") {
        return {
          status: "rate_limited",
          retryAfterSeconds: Math.min(3600, Math.max(1, Math.trunc(rateLimit.retryAfterSeconds)))
        };
      }

      const persisted = await repository.createOrFindAfterConflict({
        roomId,
        authorId,
        body: request.body,
        clientRequestId: request.clientRequestId
      });
      if (!persisted.created && !matchesCreateRequest(persisted.message, roomId, request)) {
        return { status: "conflict" };
      }
      return {
        status: persisted.created ? "created" : "replayed",
        message: serializeCreatedMessage(persisted.message)
      };
    }
  };
}

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
