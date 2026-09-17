import {
  messageHistoryInvalidResponseSchema,
  messageHistoryQuerySchema,
  messageHistoryRoomNotFoundResponseSchema,
  messageRoomIdSchema
} from "@map-chat/contracts";
import { Router } from "express";
import { decodeMessageCursor } from "./cursor.js";
import type { MessageHistoryRequest, MessageHistoryService } from "./service.js";

const invalidRequest = messageHistoryInvalidResponseSchema.parse({
  error: { code: "INVALID_MESSAGE_HISTORY_REQUEST", message: "Invalid message history request" }
});

export function createMessageHistoryRouter(service: MessageHistoryService): Router {
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
  return router;
}
