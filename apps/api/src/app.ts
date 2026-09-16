import { healthResponseSchema, notFoundResponseSchema, readinessResponseSchema } from "@map-chat/contracts";
import express, { type Express } from "express";
import { checkReadiness, type ProbeDependencies } from "./readiness.js";

export interface AppOptions { probes: ProbeDependencies; readinessTimeoutMs: number }

export function createApp(options: AppOptions): Express {
  const app = express();
  app.disable("x-powered-by");
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
