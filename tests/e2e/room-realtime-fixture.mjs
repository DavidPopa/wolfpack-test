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
const host = process.env.ROOM_REALTIME_FIXTURE_HOST ?? "127.0.0.1";
const anchorRoomId = "11111111-1111-4111-8111-111111111111";

const rooms = [{
  id: anchorRoomId,
  title: "Fixture anchor room",
  latitude: 46.7712,
  longitude: 23.6236,
  createdAt: "2026-09-17T08:00:00.000Z"
}];
const roomRequests = new Map();
const messageRequests = new Map();
const messagesByRoom = new Map([[anchorRoomId, [{
  id: "22222222-2222-4222-8222-222222222222",
  roomId: anchorRoomId,
  body: "Fixture welcome message",
  createdAt: "2026-09-17T10:00:00.000Z",
  author: { name: "Task 006 fixture user", image: null }
}]]]);
let messageSequence = 0;
let nextMessageOrder = "socket-before-http";
const state = {
  broadcasts: 0,
  connections: 0,
  messageAfterRequests: 0,
  messageBroadcasts: 0,
  messagePosts: 0,
  orderLog: [],
  postCount: 0,
  roomGetCount: 0,
  subscriptions: 0,
  transports: new Set()
};

const fixtureSession = {
  session: {
    id: "task-006-session",
    userId: "task-006-user",
    expiresAt: "2026-09-18T12:00:00.000Z",
    token: "fixture-only-token",
    createdAt: "2026-09-17T08:00:00.000Z",
    updatedAt: "2026-09-17T08:00:00.000Z"
  },
  user: {
    id: "task-006-user",
    name: "Task 006 fixture user",
    email: "task-006@example.invalid",
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

function messageRoomName(roomId) {
  return `messages:${roomId}`;
}

function cursorFor(index) {
  return `message_${index}`;
}

function cursorIndex(cursor) {
  const match = /^message_(\d+)$/.exec(cursor ?? "");
  return match ? Number(match[1]) : null;
}

function messagePage(roomMessages, url) {
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? 30)));
  const before = cursorIndex(url.searchParams.get("before"));
  const after = cursorIndex(url.searchParams.get("after"));
  let start = Math.max(0, roomMessages.length - limit);
  let end = roomMessages.length;
  if (before !== null) {
    end = Math.min(roomMessages.length, before);
    start = Math.max(0, end - limit);
  } else if (after !== null) {
    start = Math.min(roomMessages.length, after + 1);
    end = Math.min(roomMessages.length, start + limit);
    state.messageAfterRequests += 1;
  }
  const messages = roomMessages.slice(start, end);
  return {
    messages,
    pageInfo: {
      startCursor: messages.length > 0 ? cursorFor(start) : null,
      endCursor: messages.length > 0 ? cursorFor(end - 1) : null,
      hasOlder: start > 0,
      hasNewer: end < roomMessages.length
    }
  };
}

function emitMessageCreated(message, clientRequestId, order) {
  state.messageBroadcasts += 1;
  state.orderLog.push(`${order}:event`);
  io.to(messageRoomName(message.roomId)).emit("message.created", { message, clientRequestId });
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
    const replay = roomRequests.get(body.clientRequestId);
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
    messagesByRoom.set(room.id, []);
    roomRequests.set(body.clientRequestId, room);
    state.broadcasts += 1;
    io.emit("room.created", { room, clientRequestId: body.clientRequestId });
    sendJson(response, 201, { ...room, clientRequestId: body.clientRequestId });
    return;
  }

  const messageMatch = /^\/api\/rooms\/([0-9a-f-]+)\/messages$/.exec(url.pathname);
  if (messageMatch && request.method === "GET") {
    const roomMessages = messagesByRoom.get(messageMatch[1]);
    if (!roomMessages) {
      sendJson(response, 404, { error: { code: "ROOM_NOT_FOUND", message: "Room not found" } });
      return;
    }
    sendJson(response, 200, messagePage(roomMessages, url));
    return;
  }
  if (messageMatch && request.method === "POST") {
    const roomId = messageMatch[1];
    const roomMessages = messagesByRoom.get(roomId);
    if (!roomMessages) {
      sendJson(response, 404, { error: { code: "ROOM_NOT_FOUND", message: "Room not found" } });
      return;
    }
    const body = await readJson(request);
    state.messagePosts += 1;
    const replay = messageRequests.get(body.clientRequestId);
    if (replay) {
      sendJson(response, 200, { ...replay, clientRequestId: body.clientRequestId });
      return;
    }
    messageSequence += 1;
    const message = {
      id: randomUUID(),
      roomId,
      body: String(body.body).trim(),
      createdAt: new Date(Date.UTC(2026, 8, 17, 10, 0, messageSequence)).toISOString(),
      author: { name: fixtureSession.user.name, image: fixtureSession.user.image }
    };
    roomMessages.push(message);
    messageRequests.set(body.clientRequestId, message);
    const order = nextMessageOrder;
    nextMessageOrder = "socket-before-http";
    if (order === "socket-before-http") {
      emitMessageCreated(message, body.clientRequestId, order);
      state.orderLog.push(`${order}:http`);
      sendJson(response, 201, { ...message, clientRequestId: body.clientRequestId });
    } else {
      state.orderLog.push(`${order}:http`);
      sendJson(response, 201, { ...message, clientRequestId: body.clientRequestId });
      setTimeout(() => emitMessageCreated(message, body.clientRequestId, order), 150);
    }
    return;
  }

  if (request.method === "POST" && url.pathname === "/__fixture/message-order") {
    const body = await readJson(request);
    if (body.order !== "socket-before-http" && body.order !== "http-before-socket") {
      sendJson(response, 400, { error: "invalid fixture order" });
      return;
    }
    nextMessageOrder = body.order;
    sendJson(response, 200, { order: nextMessageOrder });
    return;
  }
  if (request.method === "GET" && url.pathname === "/__fixture/state") {
    sendJson(response, 200, {
      broadcasts: state.broadcasts,
      connections: state.connections,
      messageAfterRequests: state.messageAfterRequests,
      messageBroadcasts: state.messageBroadcasts,
      messageCount: [...messagesByRoom.values()].reduce((count, messages) => count + messages.length, 0),
      messagePosts: state.messagePosts,
      orderLog: state.orderLog,
      postCount: state.postCount,
      roomGetCount: state.roomGetCount,
      roomCount: rooms.length,
      subscriptions: state.subscriptions,
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
  socket.on("message.subscribe", (payload) => {
    if (!payload || typeof payload.roomId !== "string" || !messagesByRoom.has(payload.roomId)) return;
    const previousRoomId = socket.data.messageRoomId;
    if (previousRoomId === payload.roomId) return;
    if (previousRoomId) socket.leave(messageRoomName(previousRoomId));
    socket.join(messageRoomName(payload.roomId));
    socket.data.messageRoomId = payload.roomId;
    state.subscriptions += 1;
  });
  socket.on("message.unsubscribe", (payload) => {
    if (!payload || payload.roomId !== socket.data.messageRoomId) return;
    socket.leave(messageRoomName(payload.roomId));
    socket.data.messageRoomId = undefined;
  });
});

server.listen(port, host, () => {
  process.stdout.write(`room and message realtime fixture listening on ${host}:${port}\n`);
});

async function shutdown() {
  await new Promise((resolve) => io.close(resolve));
  server.close(() => process.exit(0));
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
