import {
  publicRoomSchema,
  roomCreateErrorResponseSchema,
  roomCreateRequestSchema,
  roomCreateResponseSchema,
  type PublicRoom,
  type RoomCreateRequest
} from "@map-chat/contracts";
import type { DraftCoordinates } from "./map-selection";

export const roomCreateAttemptsQueryKey = ["room-create-attempts"] as const;

export type RoomCreateFailureKind =
  | "invalid"
  | "conflict"
  | "reauthentication-required"
  | "rate-limited"
  | "unavailable"
  | "network"
  | "unexpected";

export type RoomCreateFailure = Readonly<{
  kind: RoomCreateFailureKind;
  message: string;
  retryable: boolean;
  retryAfterSeconds?: number;
}>;

export type RoomCreateAttempt = Readonly<{
  clientRequestId: string;
  coordinates: DraftCoordinates;
  status: "pending" | "failed";
  error?: RoomCreateFailure;
}>;

export type RoomCreateSuccess = Readonly<{
  room: PublicRoom;
  clientRequestId: string;
}>;

export class RoomCreateError extends Error {
  readonly failure: RoomCreateFailure;

  constructor(failure: RoomCreateFailure) {
    super(failure.message);
    this.name = "RoomCreateError";
    this.failure = failure;
  }
}

export function generateRoomClientRequestId() {
  return globalThis.crypto.randomUUID();
}

async function readJson(response: Response) {
  try {
    return await response.json() as unknown;
  } catch {
    return null;
  }
}

function classifyRoomCreateError(status: number, body: unknown): RoomCreateFailure {
  const parsed = roomCreateErrorResponseSchema.safeParse(body);
  if (!parsed.success) {
    return {
      kind: "unexpected",
      message: "Room creation failed. Please try again later.",
      retryable: false
    };
  }

  switch (parsed.data.error.code) {
    case "INVALID_ROOM_REQUEST":
      return {
        kind: "invalid",
        message: "This location could not be submitted. Choose another point on the map.",
        retryable: false
      };
    case "ROOM_REQUEST_CONFLICT":
      return {
        kind: "conflict",
        message: "This retry token was already used for a different location. Start a new attempt to continue.",
        retryable: false
      };
    case "UNAUTHORIZED":
      return {
        kind: "reauthentication-required",
        message: "Please sign in again before retrying this room.",
        retryable: true
      };
    case "ROOM_RATE_LIMITED":
      return {
        kind: "rate-limited",
        message: `Room creation is rate limited. Try again in ${parsed.data.error.retryAfterSeconds} seconds.`,
        retryable: true,
        retryAfterSeconds: parsed.data.error.retryAfterSeconds
      };
    case "ROOM_RATE_LIMIT_UNAVAILABLE":
      return {
        kind: "unavailable",
        message: "Room creation is temporarily unavailable. Try this location again in a moment.",
        retryable: true
      };
    default:
      return {
        kind: "unexpected",
        message: status === 401
          ? "Please sign in again before retrying this room."
          : "Room creation failed. Please try again later.",
        retryable: status === 401 || status === 503
      };
  }
}

export async function createRoom(request: RoomCreateRequest): Promise<RoomCreateSuccess> {
  const payload = roomCreateRequestSchema.parse(request);
  let response: Response;

  try {
    response = await fetch("/api/rooms", {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json"
      },
      body: JSON.stringify(payload)
    });
  } catch {
    throw new RoomCreateError({
      kind: "network",
      message: "Network connection was lost before the room could be created. Try this location again.",
      retryable: true
    });
  }

  const body = await readJson(response);
  if (response.status === 201 || response.status === 200) {
    const created = roomCreateResponseSchema.parse(body);
    if (created.clientRequestId !== payload.clientRequestId) {
      throw new RoomCreateError({
        kind: "unexpected",
        message: "Room creation returned an unexpected response. Please try again later.",
        retryable: false
      });
    }
    return {
      clientRequestId: created.clientRequestId,
      room: publicRoomSchema.parse({
        id: created.id,
        title: created.title,
        latitude: created.latitude,
        longitude: created.longitude,
        createdAt: created.createdAt
      })
    };
  }

  throw new RoomCreateError(classifyRoomCreateError(response.status, body));
}
