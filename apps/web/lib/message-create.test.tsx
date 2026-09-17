import type { InfiniteData } from "@tanstack/react-query";
import type { MessageHistoryResponse, PublicMessage } from "@map-chat/contracts";
import {
  createMessage,
  normalizeMessageBody,
  upsertCanonicalMessage,
  type MessageCreateError,
  type MessageCreateFailureKind
} from "./message-create";

const roomId = "11111111-1111-4111-8111-111111111111";
const clientRequestId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const canonicalMessage = {
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  roomId,
  body: "Hello map",
  createdAt: "2026-09-17T10:00:00.000Z",
  author: { name: "Avery Stone", image: null },
  clientRequestId
};

function response(status: number, body: unknown): Response {
  return { status, json: async () => body } as Response;
}

beforeEach(() => {
  Object.defineProperty(globalThis, "fetch", {
    configurable: true,
    writable: true,
    value: jest.fn()
  });
});

afterEach(() => jest.restoreAllMocks());

describe("message create HTTP boundary", () => {
  it("normalizes plain text to the server contract and rejects empty or oversized input", () => {
    expect(normalizeMessageBody("  hello map  ")).toBe("hello map");
    expect(() => normalizeMessageBody("   ")).toThrow();
    expect(() => normalizeMessageBody("x".repeat(1001))).toThrow();
  });

  it.each([201, 200] as const)("accepts canonical %i success and exposes its disposition", async (status) => {
    jest.mocked(fetch).mockResolvedValueOnce(response(status, canonicalMessage));

    await expect(createMessage({ roomId, body: "  Hello map ", clientRequestId })).resolves.toEqual({
      message: expect.objectContaining({ id: canonicalMessage.id, body: "Hello map" }),
      clientRequestId,
      disposition: status === 201 ? "created" : "replayed"
    });
    expect(fetch).toHaveBeenCalledWith(`/api/rooms/${roomId}/messages`, {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify({ body: "Hello map", clientRequestId })
    });
  });

  it.each([
    [400, { error: { code: "INVALID_MESSAGE_REQUEST", message: "Invalid message request" } }, "invalid", false],
    [401, { error: { code: "UNAUTHORIZED", message: "Authentication required" } }, "reauthentication-required", true],
    [404, { error: { code: "ROOM_NOT_FOUND", message: "Room not found" } }, "room-not-found", false],
    [409, { error: { code: "MESSAGE_REQUEST_CONFLICT", message: "Request ID already used with a different message" } }, "conflict", false],
    [429, { error: { code: "MESSAGE_RATE_LIMITED", message: "Message rate limit exceeded", retryAfterSeconds: 17 } }, "rate-limited", true],
    [503, { error: { code: "MESSAGE_RATE_LIMIT_UNAVAILABLE", message: "Message sending is temporarily unavailable", retryable: true } }, "unavailable", true]
  ] satisfies Array<[number, unknown, MessageCreateFailureKind, boolean]>) (
    "maps HTTP %i to a safe failure",
    async (status, body, kind, retryable) => {
      jest.mocked(fetch).mockResolvedValueOnce(response(status, body));
      await expect(createMessage({ roomId, body: "Hello map", clientRequestId })).rejects.toMatchObject<Partial<MessageCreateError>>({
        failure: expect.objectContaining({ kind, retryable })
      });
    }
  );

  it("bounds rate feedback and maps network or malformed success to explicit failures", async () => {
    jest.mocked(fetch).mockResolvedValueOnce(response(429, {
      error: { code: "MESSAGE_RATE_LIMITED", message: "Message rate limit exceeded", retryAfterSeconds: 17 }
    }));
    await expect(createMessage({ roomId, body: "Hello map", clientRequestId })).rejects.toMatchObject({
      failure: expect.objectContaining({ kind: "rate-limited", retryAfterSeconds: 17 })
    });

    jest.mocked(fetch).mockRejectedValueOnce(new TypeError("offline"));
    await expect(createMessage({ roomId, body: "Hello map", clientRequestId })).rejects.toMatchObject({
      failure: expect.objectContaining({ kind: "network", retryable: true })
    });

    jest.mocked(fetch).mockResolvedValueOnce(response(201, { ...canonicalMessage, roomId: "22222222-2222-4222-8222-222222222222" }));
    await expect(createMessage({ roomId, body: "Hello map", clientRequestId })).rejects.toMatchObject({
      failure: expect.objectContaining({ kind: "unexpected", retryable: false })
    });
  });
});

describe("canonical history reconciliation", () => {
  it("functionally preserves concurrent pages, replaces a matching ID once, and appends a new message", () => {
    const existing = { ...canonicalMessage };
    delete (existing as Partial<typeof canonicalMessage>).clientRequestId;
    const concurrent: PublicMessage = {
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      roomId,
      body: "Concurrent history",
      createdAt: "2026-09-17T10:01:00.000Z",
      author: { name: "Morgan", image: null }
    };
    const data: InfiniteData<MessageHistoryResponse, string | null> = {
      pages: [{
        messages: [existing as PublicMessage, existing as PublicMessage, concurrent],
        pageInfo: { startCursor: "start", endCursor: "end", hasOlder: false, hasNewer: false }
      }],
      pageParams: [null]
    };
    const replacement: PublicMessage = { ...(existing as PublicMessage), body: "Canonical replacement" };
    const replaced = upsertCanonicalMessage(data, replacement);
    expect(replaced.pages[0]?.messages).toEqual([replacement, concurrent]);

    const later: PublicMessage = {
      id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      roomId,
      body: "Later canonical",
      createdAt: "2026-09-17T10:02:00.000Z",
      author: { name: "Avery Stone", image: null }
    };
    expect(upsertCanonicalMessage(replaced, later).pages[0]?.messages).toEqual([replacement, concurrent, later]);
    expect(data.pages[0]?.messages).toHaveLength(3);
  });
});
