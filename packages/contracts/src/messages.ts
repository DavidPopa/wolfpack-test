import { z } from "zod";

export const messageCursorSchema = z.string()
  .min(1)
  .max(512)
  .regex(/^[A-Za-z0-9_-]+$/);

export const messageRoomIdSchema = z.string().uuid().refine((value) => value === value.toLowerCase());

export const publicMessageSchema = z.object({
  id: z.string().uuid(),
  roomId: z.string().uuid(),
  body: z.string().min(1).max(1000),
  createdAt: z.iso.datetime(),
  author: z.object({
    name: z.string().min(1),
    image: z.string().nullable()
  }).strict()
}).strict();

export const messageHistoryPageInfoSchema = z.object({
  startCursor: messageCursorSchema.nullable(),
  endCursor: messageCursorSchema.nullable(),
  hasOlder: z.boolean(),
  hasNewer: z.boolean()
}).strict();

export const messageHistoryResponseSchema = z.object({
  messages: z.array(publicMessageSchema),
  pageInfo: messageHistoryPageInfoSchema
}).strict();

const messageHistoryLimitSchema = z.string()
  .regex(/^(?:[1-9]|[1-9][0-9]|100)$/)
  .default("30")
  .transform(Number);

export const messageHistoryQuerySchema = z.object({
  limit: messageHistoryLimitSchema,
  before: messageCursorSchema.optional(),
  after: messageCursorSchema.optional()
}).strict().refine((query) => !(query.before && query.after));

export const messageHistoryInvalidResponseSchema = z.object({
  error: z.object({
    code: z.literal("INVALID_MESSAGE_HISTORY_REQUEST"),
    message: z.literal("Invalid message history request")
  }).strict()
}).strict();

export const messageHistoryRoomNotFoundResponseSchema = z.object({
  error: z.object({
    code: z.literal("ROOM_NOT_FOUND"),
    message: z.literal("Room not found")
  }).strict()
}).strict();

export type PublicMessage = z.infer<typeof publicMessageSchema>;
export type MessageHistoryPageInfo = z.infer<typeof messageHistoryPageInfoSchema>;
export type MessageHistoryResponse = z.infer<typeof messageHistoryResponseSchema>;
export type MessageHistoryQuery = z.infer<typeof messageHistoryQuerySchema>;
export type MessageHistoryInvalidResponse = z.infer<typeof messageHistoryInvalidResponseSchema>;
export type MessageHistoryRoomNotFoundResponse = z.infer<typeof messageHistoryRoomNotFoundResponseSchema>;
