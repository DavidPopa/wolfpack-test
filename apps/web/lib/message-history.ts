import {
  messageHistoryResponseSchema,
  type MessageHistoryResponse,
  type PublicMessage
} from "@map-chat/contracts";
import type { InfiniteData } from "@tanstack/react-query";

export const messageHistoryQueryKey = (roomId: string) => ["rooms", roomId, "messages"] as const;

export async function fetchMessageHistoryPage({
  roomId,
  before,
  after,
  limit,
  signal
}: {
  roomId: string;
  before?: string;
  after?: string;
  limit?: number;
  signal?: AbortSignal;
}): Promise<MessageHistoryResponse> {
  const query = new URLSearchParams();
  if (before) query.set("before", before);
  if (after) query.set("after", after);
  if (limit) query.set("limit", String(limit));
  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  const request: RequestInit = { headers: { accept: "application/json" } };
  if (signal) request.signal = signal;
  const response = await fetch(`/api/rooms/${encodeURIComponent(roomId)}/messages${suffix}`, request);

  if (!response.ok) throw new Error("Message history request failed");
  return messageHistoryResponseSchema.parse(await response.json());
}

const compareMessages = (left: PublicMessage, right: PublicMessage) => {
  const timestampOrder = left.createdAt.localeCompare(right.createdAt);
  return timestampOrder !== 0 ? timestampOrder : left.id.localeCompare(right.id);
};

export function flattenMessageHistory(pages: MessageHistoryResponse[]): PublicMessage[] {
  const messagesById = new Map<string, PublicMessage>();
  for (const page of pages) {
    for (const message of page.messages) messagesById.set(message.id, message);
  }

  return [...messagesById.values()].toSorted(compareMessages);
}

export function newestMessageCursor(
  data: InfiniteData<MessageHistoryResponse, string | null> | undefined
) {
  return data?.pages.findLast((page) => page.pageInfo.endCursor !== null)?.pageInfo.endCursor ?? null;
}

export function mergeMessageHistoryPage(
  data: InfiniteData<MessageHistoryResponse, string | null> | undefined,
  page: MessageHistoryResponse,
  pageParam: string | null
): InfiniteData<MessageHistoryResponse, string | null> {
  if (!data || data.pages.length === 0) {
    return { pages: [page], pageParams: [pageParam] };
  }

  const incomingIds = new Set(page.messages.map((message) => message.id));
  const pages = data.pages.map((existingPage) => ({
    ...existingPage,
    messages: existingPage.messages.filter((message) => !incomingIds.has(message.id))
  }));

  if (page.messages.length > 0) {
    pages.push(page);
    return { pages, pageParams: [...data.pageParams, pageParam] };
  }

  const newestIndex = pages.length - 1;
  const newestPage = pages[newestIndex];
  if (newestPage) {
    pages[newestIndex] = {
      ...newestPage,
      pageInfo: {
        ...newestPage.pageInfo,
        endCursor: page.pageInfo.endCursor ?? newestPage.pageInfo.endCursor,
        hasNewer: page.pageInfo.hasNewer
      }
    };
  }
  return { ...data, pages };
}

export function mergeNewestMessagePage(
  page: MessageHistoryResponse,
  current: InfiniteData<MessageHistoryResponse, string | null> | undefined
): MessageHistoryResponse {
  if (!current) return page;
  const messages = flattenMessageHistory([...current.pages, page]);
  return { ...page, messages };
}
