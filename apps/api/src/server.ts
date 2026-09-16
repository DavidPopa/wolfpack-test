import type { Express } from "express";
import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { Server as SocketServer } from "socket.io";
import type {
  ClientToServerEvents,
  InterServerEvents,
  ServerToClientEvents,
  SocketData
} from "./rooms/events.js";

export type AppSocketServer = SocketServer<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

export interface RunningServer {
  httpServer: HttpServer; io: AppSocketServer;
  listen: (port: number, host?: string) => Promise<number>; close: () => Promise<void>;
}

export function createAppServer(app: Express): RunningServer {
  const httpServer = createServer(app);
  const io = new SocketServer<
    ClientToServerEvents,
    ServerToClientEvents,
    InterServerEvents,
    SocketData
  >(httpServer, { path: "/socket.io", cors: { origin: false } });
  return {
    httpServer, io,
    listen: (port, host = "0.0.0.0") => new Promise((resolve, reject) => {
      httpServer.once("error", reject);
      httpServer.listen(port, host, () => {
        httpServer.off("error", reject);
        resolve((httpServer.address() as AddressInfo).port);
      });
    }),
    close: () => new Promise((resolve) => {
      io.close(() => {
        if (!httpServer.listening) { resolve(); return; }
        httpServer.close(() => resolve());
      });
    })
  };
}
