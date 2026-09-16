import {
  roomCreateConflictResponseSchema,
  roomCreateInvalidResponseSchema,
  roomCreateRateLimitedResponseSchema,
  roomCreateRequestSchema,
  roomCreateUnauthorizedResponseSchema,
  roomCreateUnavailableResponseSchema
} from "@map-chat/contracts";
import { Router } from "express";
import type { SessionResolver } from "../auth.js";
import type { RoomCreateService, RoomListService } from "./service.js";

export function createRoomsRouter(
  listService: RoomListService,
  createService: RoomCreateService,
  resolveIdentity: SessionResolver
): Router {
  const router = Router();
  router.get("/", async (_request, response) => {
    response.status(200).json(await listService.listPublicRooms());
  });
  router.post("/", async (request, response) => {
    const identity = await resolveIdentity({ headers: request.headers });
    if (!identity) {
      response.status(401).json(roomCreateUnauthorizedResponseSchema.parse({
        error: { code: "UNAUTHORIZED", message: "Authentication required" }
      }));
      return;
    }

    const parsedRequest = roomCreateRequestSchema.safeParse(request.body);
    if (!parsedRequest.success) {
      response.status(400).json(roomCreateInvalidResponseSchema.parse({
        error: { code: "INVALID_ROOM_REQUEST", message: "Invalid room request" }
      }));
      return;
    }

    const result = await createService.createRoom(identity.userId, parsedRequest.data);
    if (result.status === "created" || result.status === "replayed") {
      response.status(result.status === "created" ? 201 : 200).json(result.room);
      return;
    }
    if (result.status === "conflict") {
      response.status(409).json(roomCreateConflictResponseSchema.parse({
        error: { code: "ROOM_REQUEST_CONFLICT", message: "Request ID already used with different coordinates" }
      }));
      return;
    }
    if (result.status === "rate_limited") {
      const body = roomCreateRateLimitedResponseSchema.parse({
        error: {
          code: "ROOM_RATE_LIMITED",
          message: "Room creation rate limit exceeded",
          retryAfterSeconds: result.retryAfterSeconds
        }
      });
      response.set("Retry-After", String(body.error.retryAfterSeconds)).status(429).json(body);
      return;
    }
    response.status(503).json(roomCreateUnavailableResponseSchema.parse({
      error: {
        code: "ROOM_RATE_LIMIT_UNAVAILABLE",
        message: "Room creation is temporarily unavailable",
        retryable: true
      }
    }));
  });
  return router;
}
