import { roomListResponseSchema, type RoomListResponse } from "@map-chat/contracts";

export async function fetchPublicRooms(): Promise<RoomListResponse> {
  const response = await fetch("/api/rooms", {
    headers: { accept: "application/json" }
  });

  if (!response.ok) throw new Error("Room list request failed");
  return roomListResponseSchema.parse(await response.json());
}
