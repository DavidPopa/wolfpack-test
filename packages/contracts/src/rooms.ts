import { z } from "zod";

export const publicRoomSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1),
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  createdAt: z.iso.datetime()
}).strict();

export const roomListResponseSchema = z.array(publicRoomSchema);

const coordinateSchema = (minimum: number, maximum: number) =>
  z.number().finite().min(minimum).max(maximum).transform((value) => Object.is(value, -0) ? 0 : value);

export const roomCreateRequestSchema = z.object({
  latitude: coordinateSchema(-90, 90),
  longitude: coordinateSchema(-180, 180),
  clientRequestId: z.string().uuid()
}).strict();

export const roomCreateResponseSchema = publicRoomSchema.extend({
  clientRequestId: z.string().uuid()
}).strict();

export const roomCreateUnauthorizedResponseSchema = z.object({
  error: z.object({ code: z.literal("UNAUTHORIZED"), message: z.literal("Authentication required") }).strict()
}).strict();

export const roomCreateInvalidResponseSchema = z.object({
  error: z.object({ code: z.literal("INVALID_ROOM_REQUEST"), message: z.literal("Invalid room request") }).strict()
}).strict();

export const roomCreateConflictResponseSchema = z.object({
  error: z.object({ code: z.literal("ROOM_REQUEST_CONFLICT"), message: z.literal("Request ID already used with different coordinates") }).strict()
}).strict();

export const roomCreateRateLimitedResponseSchema = z.object({
  error: z.object({
    code: z.literal("ROOM_RATE_LIMITED"),
    message: z.literal("Room creation rate limit exceeded"),
    retryAfterSeconds: z.number().int().min(1).max(3600)
  }).strict()
}).strict();

export const roomCreateUnavailableResponseSchema = z.object({
  error: z.object({
    code: z.literal("ROOM_RATE_LIMIT_UNAVAILABLE"),
    message: z.literal("Room creation is temporarily unavailable"),
    retryable: z.literal(true)
  }).strict()
}).strict();

export const roomCreateErrorResponseSchema = z.union([
  roomCreateUnauthorizedResponseSchema,
  roomCreateInvalidResponseSchema,
  roomCreateConflictResponseSchema,
  roomCreateRateLimitedResponseSchema,
  roomCreateUnavailableResponseSchema
]);

export type PublicRoom = z.infer<typeof publicRoomSchema>;
export type RoomListResponse = z.infer<typeof roomListResponseSchema>;
export type RoomCreateRequest = z.infer<typeof roomCreateRequestSchema>;
export type RoomCreateResponse = z.infer<typeof roomCreateResponseSchema>;
export type RoomCreateErrorResponse = z.infer<typeof roomCreateErrorResponseSchema>;
