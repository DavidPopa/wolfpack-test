import {
  messageCreateErrorResponseSchema,
  messageCreateRequestSchema,
  messageCreateResponseSchema,
  messageRoomIdSchema,
  publicMessageSchema,
  type MessageCreateRequest,
  type MessageHistoryResponse,
  type PublicMessage
} from "@map-chat/contracts";
import type { InfiniteData } from "@tanstack/react-query";

export const messageCreateAttemptsQueryKey = ["message-create-attempts"] as const;
export const messageDraftsQueryKey = ["message-drafts"] as const;

export type MessageCreateFailureKind =
  | "invalid"
  | "reauthentication-required"
  | "room-not-found"
  | "conflict"
  | "rate-limited"
  | "unavailable"
  | "network"
  | "unexpected";

export type MessageCreateFailure = Readonly<{
  kind: MessageCreateFailureKind;
  message: string;
  retryable: boolean;
  retryAfterSeconds?: number;
}>;

export type MessageCreateAttempt = Readonly<{
  clientRequestId: string;
  roomId: string;
  body: string;
  author: Readonly<{ name: string; image: string | null }>;
  status: "pending" | "failed";
  error?: MessageCreateFailure;
}>;

export type MessageCreateInput = MessageCreateRequest & Readonly<{ roomId: string }>;

export type MessageCreateSuccess = Readonly<{
  message: PublicMessage;
  clientRequestId: string;
  disposition: "created" | "replayed";
}>;

export class MessageCreateError extends Error {
  readonly failure: MessageCreateFailure;

  constructor(failure: MessageCreateFailure) {
    super(failure.message);
    this.name = "MessageCreateError";
    this.failure = failure;
  }
}

export function generateMessageClientRequestId() {
  return globalThis.crypto.randomUUID();
}

export function normalizeMessageBody(body: string) {
  return messageCreateRequestSchema.shape.body.parse(body);
}

async function readJson(response: Response) {
  try {
    return await response.json() as unknown;
  } catch {
    return null;
  }
}

const unexpectedFailure = (): MessageCreateFailure => ({
  kind: "unexpected",
  message: "Message sending returned an unexpected response. Please start a new attempt.",
  retryable: false
});

function classifyMessageCreateError(status: number, body: unknown): MessageCreateFailure {
  const parsed = messageCreateErrorResponseSchema.safeParse(body);
  if (!parsed.success) return unexpectedFailure();

  switch (parsed.data.error.code) {
    case "INVALID_MESSAGE_REQUEST":
      return status === 400
        ? { kind: "invalid", message: "This message is invalid. Edit it and start a new attempt.", retryable: false }
        : unexpectedFailure();
    case "UNAUTHORIZED":
      return status === 401
        ? { kind: "reauthentication-required", message: "Please sign in again before retrying this message.", retryable: true }
        : unexpectedFailure();
    case "ROOM_NOT_FOUND":
      return status === 404
        ? { kind: "room-not-found", message: "This room is no longer available. Your message was not sent.", retryable: false }
        : unexpectedFailure();
    case "MESSAGE_REQUEST_CONFLICT":
      return status === 409
        ? { kind: "conflict", message: "This retry ID was already used for a different message. Start a new attempt.", retryable: false }
        : unexpectedFailure();
    case "MESSAGE_RATE_LIMITED":
      return status === 429
        ? {
            kind: "rate-limited",
            message: `Message sending is rate limited. Try again in ${parsed.data.error.retryAfterSeconds} seconds.`,
            retryable: true,
            retryAfterSeconds: parsed.data.error.retryAfterSeconds
          }
        : unexpectedFailure();
    case "MESSAGE_RATE_LIMIT_UNAVAILABLE":
      return status === 503
        ? { kind: "unavailable", message: "Message sending is temporarily unavailable. Try again in a moment.", retryable: true }
        : unexpectedFailure();
  }
}

export async function createMessage(input: MessageCreateInput): Promise<MessageCreateSuccess> {
  const roomId = messageRoomIdSchema.parse(input.roomId);
  const payload = messageCreateRequestSchema.parse({
    body: input.body,
    clientRequestId: input.clientRequestId
  });
  let response: Response;

  try {
    response = await fetch(`/api/rooms/${encodeURIComponent(roomId)}/messages`, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json"
      },
      body: JSON.stringify(payload)
    });
  } catch {
    throw new MessageCreateError({
      kind: "network",
      message: "The network connection was lost before this message was confirmed. Retry this attempt.",
      retryable: true
    });
  }

  const body = await readJson(response);
  if (response.status === 201 || response.status === 200) {
    const parsed = messageCreateResponseSchema.safeParse(body);
    if (
      !parsed.success
      || parsed.data.clientRequestId !== payload.clientRequestId
      || parsed.data.roomId !== roomId
      || parsed.data.body !== payload.body
    ) {
      throw new MessageCreateError(unexpectedFailure());
    }

    return {
      message: publicMessageSchema.parse({
        id: parsed.data.id,
        roomId: parsed.data.roomId,
        body: parsed.data.body,
        createdAt: parsed.data.createdAt,
        author: parsed.data.author
      }),
      clientRequestId: parsed.data.clientRequestId,
      disposition: response.status === 201 ? "created" : "replayed"
    };
  }

  throw new MessageCreateError(classifyMessageCreateError(response.status, body));
}

export function upsertCanonicalMessage(
  data: InfiniteData<MessageHistoryResponse, string | null>,
  message: PublicMessage
): InfiniteData<MessageHistoryResponse, string | null> {
  if (data.pages.length === 0) return data;

  let found = false;
  const pages = data.pages.map((page) => ({
    ...page,
    messages: page.messages.flatMap((candidate) => {
      if (candidate.id !== message.id) return [candidate];
      if (found) return [];
      found = true;
      return [message];
    })
  }));

  if (!found) {
    const newestIndex = pages.length - 1;
    const newest = pages[newestIndex];
    if (newest) {
      pages[newestIndex] = {
        ...newest,
        messages: [...newest.messages, message].toSorted((left, right) => {
          const timestampOrder = left.createdAt.localeCompare(right.createdAt);
          return timestampOrder !== 0 ? timestampOrder : left.id.localeCompare(right.id);
        })
      };
    }
  }

  return { ...data, pages };
}
