import {
  publicRoomSchema,
  roomListResponseSchema,
  type PublicRoom,
  type RoomListResponse
} from "@map-chat/contracts";

export const roomsQueryKey = ["rooms"] as const;

export async function fetchPublicRooms(): Promise<RoomListResponse> {
  const response = await fetch("/api/rooms", {
    headers: { accept: "application/json" }
  });

  if (!response.ok) throw new Error("Room list request failed");
  return roomListResponseSchema.parse(await response.json());
}

function comparePublicRooms(left: PublicRoom, right: PublicRoom) {
  const createdAtOrder = left.createdAt.localeCompare(right.createdAt);
  if (createdAtOrder !== 0) return createdAtOrder;
  return left.id.localeCompare(right.id);
}

export function upsertPublicRoom(rooms: PublicRoom[] | undefined, room: PublicRoom) {
  const canonicalRoom = publicRoomSchema.parse(room);
  const existing = rooms ?? [];
  const next = existing.some((candidate) => candidate.id === canonicalRoom.id)
    ? existing.map((candidate) => candidate.id === canonicalRoom.id ? canonicalRoom : candidate)
    : [...existing, canonicalRoom];
  return next.toSorted(comparePublicRooms);
}

export function mergePublicRooms(
  existing: PublicRoom[] | undefined,
  incoming: PublicRoom[]
) {
  return incoming.reduce<PublicRoom[]>(
    (rooms, room) => upsertPublicRoom(rooms, room),
    existing ?? []
  );
}
