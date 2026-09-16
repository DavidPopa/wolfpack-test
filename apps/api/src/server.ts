import type { Express } from "express";
import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { Server as SocketServer } from "socket.io";

export interface RunningServer {
  httpServer: HttpServer; io: SocketServer;
  listen: (port: number, host?: string) => Promise<number>; close: () => Promise<void>;
}

export function createAppServer(app: Express): RunningServer {
  const httpServer = createServer(app);
  const io = new SocketServer(httpServer, { path: "/socket.io", cors: { origin: false } });
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
