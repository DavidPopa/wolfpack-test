import {
  createRoom,
  type RoomCreateError,
  type RoomCreateFailureKind
} from "./room-create";

const clientRequestId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const room = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "Room at 12.5000, 23.7500",
  latitude: 12.5,
  longitude: 23.75,
  createdAt: "2026-09-17T10:00:00.000Z",
  clientRequestId
};

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body
  } as Response;
}

beforeEach(() => {
  Object.defineProperty(globalThis, "fetch", {
    configurable: true,
    writable: true,
    value: jest.fn()
  });
});

afterEach(() => jest.restoreAllMocks());

describe("room create HTTP boundary", () => {
  it.each([201, 200])("accepts canonical %i success with the echoed request ID", async (status) => {
    jest.mocked(fetch).mockResolvedValueOnce(jsonResponse(status, room));

    await expect(createRoom({ latitude: 12.5, longitude: 23.75, clientRequestId }))
      .resolves.toEqual({ room: expect.objectContaining({ id: room.id }), clientRequestId });
    expect(fetch).toHaveBeenCalledWith("/api/rooms", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ latitude: 12.5, longitude: 23.75, clientRequestId })
    }));
  });

  it.each([
    [400, { error: { code: "INVALID_ROOM_REQUEST", message: "Invalid room request" } }, "invalid", false],
    [401, { error: { code: "UNAUTHORIZED", message: "Authentication required" } }, "reauthentication-required", true],
    [409, { error: { code: "ROOM_REQUEST_CONFLICT", message: "Request ID already used with different coordinates" } }, "conflict", false],
    [429, { error: { code: "ROOM_RATE_LIMITED", message: "Room creation rate limit exceeded", retryAfterSeconds: 17 } }, "rate-limited", true],
    [503, { error: { code: "ROOM_RATE_LIMIT_UNAVAILABLE", message: "Room creation is temporarily unavailable", retryable: true } }, "unavailable", true]
  ] satisfies Array<[number, unknown, RoomCreateFailureKind, boolean]>) (
    "classifies HTTP %i without exposing raw internals",
    async (status, body, kind, retryable) => {
      jest.mocked(fetch).mockResolvedValueOnce(jsonResponse(status, body));
      const result = createRoom({ latitude: 12.5, longitude: 23.75, clientRequestId });
      await expect(result).rejects.toMatchObject<Partial<RoomCreateError>>({
        failure: expect.objectContaining({ kind, retryable })
      });
    }
  );

  it("classifies network loss as retryable and rejects a mismatched success request ID", async () => {
    jest.mocked(fetch).mockRejectedValueOnce(new TypeError("offline"));
    await expect(createRoom({ latitude: 12.5, longitude: 23.75, clientRequestId }))
      .rejects.toMatchObject({ failure: expect.objectContaining({ kind: "network", retryable: true }) });

    jest.mocked(fetch).mockResolvedValueOnce(jsonResponse(201, {
      ...room,
      clientRequestId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
    }));
    await expect(createRoom({ latitude: 12.5, longitude: 23.75, clientRequestId }))
      .rejects.toMatchObject({ failure: expect.objectContaining({ kind: "unexpected", retryable: false }) });
  });
});
