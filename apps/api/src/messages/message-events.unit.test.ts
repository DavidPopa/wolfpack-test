import { randomUUID } from "node:crypto";
import {
  messageCreatedEventPayloadSchema,
  messageRoomSubscriptionSchema,
  type MessageCreatedEventPayload
} from "@map-chat/contracts";
import { ZodError } from "zod";
import type { RoomSocketServer } from "../rooms/events.js";
import {
  createSocketMessageEventPublisher,
  disabledMessageEventPublisher,
  MESSAGE_CREATED_EVENT,
  MESSAGE_SUBSCRIBE_EVENT,
  MESSAGE_UNSUBSCRIBE_EVENT,
  messageRoomChannel
} from "./events.js";

const firstRoomId = "1a000000-0000-4000-8000-000000000001";
const secondRoomId = "1b000000-0000-4000-8000-000000000002";
const payload = {
  message: {
    id: "20000000-0000-4000-8000-000000000001",
    roomId: firstRoomId,
    body: "Browser-safe message",
    createdAt: "2026-09-17T12:00:00.000Z",
    author: { name: "Fixture author", image: null }
  },
  clientRequestId: "30000000-0000-4000-8000-000000000001"
} satisfies MessageCreatedEventPayload;

async function settleTransitions(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

describe("message realtime contracts and publisher", () => {
  it("accepts only strict UUID subscriptions and privacy-safe canonical events", () => {
    expect(messageRoomSubscriptionSchema.parse({ roomId: firstRoomId })).toEqual({ roomId: firstRoomId });
    for (const candidate of [
      { roomId: "not-a-uuid" },
      { roomId: firstRoomId.toUpperCase() },
      { roomId: firstRoomId, extra: true }
    ]) expect(messageRoomSubscriptionSchema.safeParse(candidate).success).toBe(false);

    expect(messageCreatedEventPayloadSchema.parse(payload)).toEqual(payload);
    for (const candidate of [
      { ...payload, authorId: randomUUID() },
      { ...payload, message: { ...payload.message, authorId: randomUUID() } },
      { ...payload, message: { ...payload.message, author: { ...payload.message.author, email: "private@example.invalid" } } },
      { ...payload, clientRequestId: "not-a-uuid" }
    ]) expect(messageCreatedEventPayloadSchema.safeParse(candidate).success).toBe(false);
  });

  it("leaves the previous room before joining a new one and ignores invalid or nonmatching unsubscribe payloads", async () => {
    const connectionHandlers: Array<(socket: unknown) => void> = [];
    const eventHandlers = new Map<string, (payload: unknown) => void>();
    const calls: string[] = [];
    const socket = {
      connected: true,
      data: {} as { messageRoomId?: string },
      on: (event: string, handler: (payload: unknown) => void) => { eventHandlers.set(event, handler); },
      join: async (room: string) => { calls.push(`join:${room}`); },
      leave: async (room: string) => { calls.push(`leave:${room}`); }
    };
    const io = {
      on: (event: string, handler: (socket: unknown) => void) => {
        if (event === "connection") connectionHandlers.push(handler);
      },
      to: () => ({ emit: () => undefined })
    } as unknown as RoomSocketServer;
    createSocketMessageEventPublisher().bind(io);
    connectionHandlers[0]?.(socket);

    eventHandlers.get(MESSAGE_SUBSCRIBE_EVENT)?.({ roomId: firstRoomId });
    eventHandlers.get(MESSAGE_SUBSCRIBE_EVENT)?.({ roomId: secondRoomId });
    await settleTransitions();
    expect(calls).toEqual([
      `join:${messageRoomChannel(firstRoomId)}`,
      `leave:${messageRoomChannel(firstRoomId)}`,
      `join:${messageRoomChannel(secondRoomId)}`
    ]);
    expect(socket.data.messageRoomId).toBe(secondRoomId);

    eventHandlers.get(MESSAGE_SUBSCRIBE_EVENT)?.({ roomId: "invalid" });
    eventHandlers.get(MESSAGE_UNSUBSCRIBE_EVENT)?.({ roomId: firstRoomId });
    await settleTransitions();
    expect(calls).toHaveLength(3);

    eventHandlers.get(MESSAGE_UNSUBSCRIBE_EVENT)?.({ roomId: secondRoomId });
    await settleTransitions();
    expect(calls.at(-1)).toBe(`leave:${messageRoomChannel(secondRoomId)}`);
    expect(socket.data.messageRoomId).toBeUndefined();
  });

  it("parses at publish time and targets only the message room without acknowledgement", () => {
    const emit = jest.fn();
    const to = jest.fn(() => ({ emit }));
    const publisher = createSocketMessageEventPublisher();
    publisher.bind({ on: jest.fn(), to } as unknown as RoomSocketServer);

    publisher.publishMessageCreated(payload);

    expect(to).toHaveBeenCalledWith(messageRoomChannel(firstRoomId));
    expect(emit).toHaveBeenCalledWith(MESSAGE_CREATED_EVENT, payload);
    expect(emit.mock.calls[0]).toHaveLength(2);
    expect(() => publisher.publishMessageCreated({
      ...payload,
      message: { ...payload.message, authorId: randomUUID() }
    } as unknown as MessageCreatedEventPayload)).toThrow(ZodError);
    expect(() => disabledMessageEventPublisher.publishMessageCreated(payload)).not.toThrow();
  });
});
