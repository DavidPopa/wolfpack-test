import { messageCursorSchema } from "@map-chat/contracts";
import { z } from "zod";

export interface MessageCursor {
  createdAt: Date;
  id: string;
}

const canonicalTimestampSchema = z.string().refine((value) => {
  const parsed = z.iso.datetime().safeParse(value);
  return parsed.success && new Date(value).toISOString() === value;
});

const canonicalUuidSchema = z.string().uuid().refine((value) => value === value.toLowerCase());

const cursorPayloadSchema = z.object({
  version: z.literal(1),
  createdAt: canonicalTimestampSchema,
  id: canonicalUuidSchema
}).strict();

export function encodeMessageCursor(cursor: MessageCursor): string {
  const payload = cursorPayloadSchema.parse({
    version: 1,
    createdAt: cursor.createdAt.toISOString(),
    id: cursor.id
  });
  return messageCursorSchema.parse(Buffer.from(JSON.stringify(payload), "utf8").toString("base64url"));
}

export function decodeMessageCursor(value: string): MessageCursor {
  try {
    const token = messageCursorSchema.parse(value);
    const payload: z.infer<typeof cursorPayloadSchema> = cursorPayloadSchema.parse(
      JSON.parse(Buffer.from(token, "base64url").toString("utf8"))
    );
    const cursor = { createdAt: new Date(payload.createdAt), id: payload.id };
    if (encodeMessageCursor(cursor) !== token) throw new Error("Invalid message cursor");
    return cursor;
  } catch {
    throw new Error("Invalid message cursor");
  }
}
