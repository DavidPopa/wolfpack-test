import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const socketEntry = require.resolve("socket.io", {
  paths: [path.resolve(process.cwd(), "apps/api")]
});
const { Server } = await import(pathToFileURL(socketEntry).href);
const port = Number(process.env.ROOM_REALTIME_FIXTURE_PORT ?? 4108);

const rooms = [{
  id: "11111111-1111-4111-8111-111111111111",
  title: "Fixture anchor room",
  latitude: 46.7712,
  longitude: 23.6236,
  createdAt: "2026-09-17T08:00:00.000Z"
}];
const requests = new Map();
const state = {
  broadcasts: 0,
  connections: 0,
  postCount: 0,
  roomGetCount: 0,
  transports: new Set()
};

const fixtureSession = {
  session: {
    id: "task-008-session",
    userId: "task-008-user",
    expiresAt: "2026-09-18T12:00:00.000Z",
    token: "fixture-only-token",
    createdAt: "2026-09-17T08:00:00.000Z",
    updatedAt: "2026-09-17T08:00:00.000Z"
  },
  user: {
    id: "task-008-user",
    name: "Task 008 fixture user",
    email: "task-008@example.invalid",
    emailVerified: true,
    image: null,
    createdAt: "2026-09-17T08:00:00.000Z",
    updatedAt: "2026-09-17T08:00:00.000Z"
  }
};

function sendJson(response, status, body) {
  response.writeHead(status, {
    "content-type": "application/json",
    "cache-control": "no-store"
  });
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "127.0.0.1"}`);
  if (request.method === "GET" && url.pathname === "/api/auth/get-session") {
    sendJson(response, 200, fixtureSession);
    return;
  }
  if (request.method === "GET" && url.pathname === "/api/rooms") {
    state.roomGetCount += 1;
    sendJson(response, 200, rooms);
    return;
  }
  if (request.method === "POST" && url.pathname === "/api/rooms") {
    const body = await readJson(request);
    state.postCount += 1;
    const replay = requests.get(body.clientRequestId);
    if (replay) {
      sendJson(response, 200, { ...replay, clientRequestId: body.clientRequestId });
      return;
    }
    const room = {
      id: randomUUID(),
      title: `Fixture room ${rooms.length}`,
      latitude: body.latitude,
      longitude: body.longitude,
      createdAt: new Date(Date.UTC(2026, 8, 17, 8, rooms.length)).toISOString()
    };
    rooms.push(room);
    requests.set(body.clientRequestId, room);
    state.broadcasts += 1;
    io.emit("room.created", { room, clientRequestId: body.clientRequestId });
    sendJson(response, 201, { ...room, clientRequestId: body.clientRequestId });
    return;
  }
  if (request.method === "GET" && url.pathname === "/__fixture/state") {
    sendJson(response, 200, {
      broadcasts: state.broadcasts,
      connections: state.connections,
      postCount: state.postCount,
      roomGetCount: state.roomGetCount,
      roomCount: rooms.length,
      transports: [...state.transports].sort()
    });
    return;
  }
  sendJson(response, 404, { error: "fixture route not found" });
});

const io = new Server(server, { path: "/socket.io", cors: { origin: false } });
io.on("connection", (socket) => {
  state.connections += 1;
  state.transports.add(socket.conn.transport.name);
  socket.conn.on("upgrade", (transport) => state.transports.add(transport.name));
});

server.listen(port, "127.0.0.1", () => {
  process.stdout.write(`task-008 fixture listening on 127.0.0.1:${port}\n`);
});

async function shutdown() {
  await new Promise((resolve) => io.close(resolve));
  server.close(() => process.exit(0));
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
