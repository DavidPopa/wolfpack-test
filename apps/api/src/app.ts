import { healthResponseSchema, notFoundResponseSchema, readinessResponseSchema } from "@map-chat/contracts";
import express, { type Express } from "express";
import type { AuthBoundary, SessionResolver } from "./auth.js";
import { createMessageHistoryRouter } from "./messages/router.js";
import { disabledMessageEventPublisher, type MessageEventPublisher } from "./messages/events.js";
import {
  disabledMessageCreateService,
  disabledMessageHistoryService,
  type MessageCreateService,
  type MessageHistoryService
} from "./messages/service.js";
import { checkReadiness, type ProbeDependencies } from "./readiness.js";
import { disabledRoomEventPublisher, type RoomEventPublisher } from "./rooms/events.js";
import { createRoomsRouter } from "./rooms/router.js";
import type { RoomCreateService, RoomListService } from "./rooms/service.js";

export interface AppOptions {
  auth: AuthBoundary;
  probes: ProbeDependencies;
  readinessTimeoutMs: number;
  rooms: RoomListService;
  roomCreation: RoomCreateService;
  roomEvents?: RoomEventPublisher;
  messages?: MessageHistoryService;
  messageCreation?: MessageCreateService;
  messageEvents?: MessageEventPublisher;
}

export type ApiApplication = Express & { readonly resolveIdentity: SessionResolver };

export function createApp(options: AppOptions): ApiApplication {
  const app = express() as ApiApplication;
  Object.defineProperty(app, "resolveIdentity", {
    value: options.auth.resolveIdentity,
    writable: false,
    configurable: false,
    enumerable: false
  });
  app.disable("x-powered-by");
  app.all("/api/auth/*splat", options.auth.handler);
  app.use(express.json());
  app.use("/api/rooms", createMessageHistoryRouter(
    options.messages ?? disabledMessageHistoryService,
    options.messageCreation ?? disabledMessageCreateService,
    options.auth.resolveIdentity,
    options.messageEvents ?? disabledMessageEventPublisher
  ));
  app.use("/api/rooms", createRoomsRouter(
    options.rooms,
    options.roomCreation,
    options.auth.resolveIdentity,
    options.roomEvents ?? disabledRoomEventPublisher
  ));
  app.get("/api/health", (_request, response) => {
    response.status(200).json(healthResponseSchema.parse({ status: "ok", service: "api" }));
  });
  app.get("/api/ready", async (_request, response) => {
    const readiness = readinessResponseSchema.parse(await checkReadiness(options.probes, options.readinessTimeoutMs));
    response.status(readiness.status === "ready" ? 200 : 503).json(readiness);
  });
  app.use("/api", (_request, response) => {
    response.status(404).json(notFoundResponseSchema.parse({ error: { code: "NOT_FOUND", message: "Route not found" } }));
  });
  return app;
}
