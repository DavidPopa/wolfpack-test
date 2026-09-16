import { z } from "zod";

export const publicRoomSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1),
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  createdAt: z.iso.datetime()
}).strict();

export const roomListResponseSchema = z.array(publicRoomSchema);

export type PublicRoom = z.infer<typeof publicRoomSchema>;
export type RoomListResponse = z.infer<typeof roomListResponseSchema>;
