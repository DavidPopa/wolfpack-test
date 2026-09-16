import { randomUUID } from "node:crypto";
import { roomCreatedEventPayloadSchema, type RoomCreatedEventPayload } from "@map-chat/contracts";
import { ZodError } from "zod";
import {
  createSocketRoomEventPublisher,
  disabledRoomEventPublisher,
  ROOM_CREATED_EVENT,
  type RoomSocketServer
} from "./events.js";

const payload = {
  room: {
    id: "e557f4c5-3506-4fa7-9c3e-df62f7751e44",
    title: "Room at 44.4268, 26.1025",
    latitude: 44.4268,
    longitude: 26.1025,
    createdAt: "2026-09-16T10:00:00.000Z"
  },
  clientRequestId: "5d6647f5-6d1e-4d34-8353-0388687cbfc1"
} satisfies RoomCreatedEventPayload;

describe("room.created event contract and publisher", () => {
  it("accepts only the browser-safe canonical room payload and stable correlation ID", () => {
    expect(roomCreatedEventPayloadSchema.parse(payload)).toEqual(payload);
    for (const candidate of [
      { ...payload, creatorId: randomUUID() },
      { ...payload, room: { ...payload.room, creatorId: randomUUID() } },
      { ...payload, room: { ...payload.room, clientRequestId: payload.clientRequestId } },
      { ...payload, clientRequestId: "not-a-uuid" }
    ]) expect(roomCreatedEventPayloadSchema.safeParse(candidate).success).toBe(false);
  });

  it("parses at the Socket.IO publish boundary and emits room.created without acknowledgement", () => {
    const emit = jest.fn();
    const publisher = createSocketRoomEventPublisher();
    publisher.bind({ emit } as unknown as RoomSocketServer);

    publisher.publishRoomCreated(payload);

    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith(ROOM_CREATED_EVENT, payload);
    expect(emit.mock.calls[0]).toHaveLength(2);
    expect(() => publisher.publishRoomCreated({
      ...payload,
      room: { ...payload.room, creatorId: randomUUID() }
    } as unknown as RoomCreatedEventPayload)).toThrow(ZodError);
  });

  it("keeps tests and routes without a bound Socket.IO server as a no-op publisher", () => {
    expect(() => disabledRoomEventPublisher.publishRoomCreated(payload)).not.toThrow();
    expect(() => createSocketRoomEventPublisher().publishRoomCreated(payload)).not.toThrow();
  });
});
