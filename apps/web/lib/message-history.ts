import {
  messageHistoryResponseSchema,
  type MessageHistoryResponse,
  type PublicMessage
} from "@map-chat/contracts";

export const messageHistoryQueryKey = (roomId: string) => ["rooms", roomId, "messages"] as const;

export async function fetchMessageHistoryPage({
  roomId,
  before,
  signal
}: {
  roomId: string;
  before?: string;
  signal?: AbortSignal;
}): Promise<MessageHistoryResponse> {
  const query = new URLSearchParams();
  if (before) query.set("before", before);
  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  const request: RequestInit = { headers: { accept: "application/json" } };
  if (signal) request.signal = signal;
  const response = await fetch(`/api/rooms/${encodeURIComponent(roomId)}/messages${suffix}`, request);

  if (!response.ok) throw new Error("Message history request failed");
  return messageHistoryResponseSchema.parse(await response.json());
}

export function flattenMessageHistory(pages: MessageHistoryResponse[]): PublicMessage[] {
  const messagesById = new Map<string, PublicMessage>();
  for (const page of pages) {
    for (const message of page.messages) messagesById.set(message.id, message);
  }

  return [...messagesById.values()].toSorted((left, right) => {
    const timestampOrder = left.createdAt.localeCompare(right.createdAt);
    return timestampOrder !== 0 ? timestampOrder : left.id.localeCompare(right.id);
  });
}
