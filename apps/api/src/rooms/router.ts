import { Router } from "express";
import type { RoomListService } from "./service.js";

export function createRoomsRouter(service: RoomListService): Router {
  const router = Router();
  router.get("/", async (_request, response) => {
    response.status(200).json(await service.listPublicRooms());
  });
  return router;
}
