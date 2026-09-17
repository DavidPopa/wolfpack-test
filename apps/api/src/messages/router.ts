import {
  messageCreateConflictResponseSchema,
  messageCreateInvalidResponseSchema,
  messageCreateRateLimitedResponseSchema,
  messageCreateRequestSchema,
  messageCreateUnauthorizedResponseSchema,
  messageCreateUnavailableResponseSchema,
  messageHistoryInvalidResponseSchema,
  messageHistoryQuerySchema,
  messageHistoryRoomNotFoundResponseSchema,
  messageRoomIdSchema
} from "@map-chat/contracts";
import { Router } from "express";
import type { SessionResolver } from "../auth.js";
import { decodeMessageCursor } from "./cursor.js";
import {
  disabledMessageCreateService,
  type MessageCreateService,
  type MessageHistoryRequest,
  type MessageHistoryService
} from "./service.js";

const invalidRequest = messageHistoryInvalidResponseSchema.parse({
  error: { code: "INVALID_MESSAGE_HISTORY_REQUEST", message: "Invalid message history request" }
});

export function createMessageHistoryRouter(
  service: MessageHistoryService,
  createService: MessageCreateService = disabledMessageCreateService,
  resolveIdentity: SessionResolver = async () => null
): Router {
  const router = Router();
  router.get("/:roomId/messages", async (request, response) => {
    const roomId = messageRoomIdSchema.safeParse(request.params.roomId);
    const query = messageHistoryQuerySchema.safeParse(request.query);
    if (!roomId.success || !query.success) {
      response.status(400).json(invalidRequest);
      return;
    }

    const historyRequest: MessageHistoryRequest = { limit: query.data.limit };
    try {
      if (query.data.before) historyRequest.before = decodeMessageCursor(query.data.before);
      if (query.data.after) historyRequest.after = decodeMessageCursor(query.data.after);
    } catch {
      response.status(400).json(invalidRequest);
      return;
    }

    const result = await service.getHistory(roomId.data, historyRequest);
    if (result.status === "room_not_found") {
      response.status(404).json(messageHistoryRoomNotFoundResponseSchema.parse({
        error: { code: "ROOM_NOT_FOUND", message: "Room not found" }
      }));
      return;
    }
    if (result.status === "invalid_cursor") {
      response.status(400).json(invalidRequest);
      return;
    }
    response.status(200).json(result.page);
  });
  router.post("/:roomId/messages", async (request, response) => {
    const identity = await resolveIdentity({ headers: request.headers });
    if (!identity) {
      response.status(401).json(messageCreateUnauthorizedResponseSchema.parse({
        error: { code: "UNAUTHORIZED", message: "Authentication required" }
      }));
      return;
    }

    const roomId = messageRoomIdSchema.safeParse(request.params.roomId);
    const parsedRequest = messageCreateRequestSchema.safeParse(request.body);
    if (!roomId.success || !parsedRequest.success) {
      response.status(400).json(messageCreateInvalidResponseSchema.parse({
        error: { code: "INVALID_MESSAGE_REQUEST", message: "Invalid message request" }
      }));
      return;
    }

    const result = await createService.createMessage(identity.userId, roomId.data, parsedRequest.data);
    if (result.status === "created" || result.status === "replayed") {
      response.status(result.status === "created" ? 201 : 200).json(result.message);
      return;
    }
    if (result.status === "room_not_found") {
      response.status(404).json(messageHistoryRoomNotFoundResponseSchema.parse({
        error: { code: "ROOM_NOT_FOUND", message: "Room not found" }
      }));
      return;
    }
    if (result.status === "conflict") {
      response.status(409).json(messageCreateConflictResponseSchema.parse({
        error: {
          code: "MESSAGE_REQUEST_CONFLICT",
          message: "Request ID already used with a different message"
        }
      }));
      return;
    }
    if (result.status === "rate_limited") {
      const body = messageCreateRateLimitedResponseSchema.parse({
        error: {
          code: "MESSAGE_RATE_LIMITED",
          message: "Message rate limit exceeded",
          retryAfterSeconds: result.retryAfterSeconds
        }
      });
      response.set("Retry-After", String(body.error.retryAfterSeconds)).status(429).json(body);
      return;
    }
    response.status(503).json(messageCreateUnavailableResponseSchema.parse({
      error: {
        code: "MESSAGE_RATE_LIMIT_UNAVAILABLE",
        message: "Message sending is temporarily unavailable",
        retryable: true
      }
    }));
  });
  return router;
}
