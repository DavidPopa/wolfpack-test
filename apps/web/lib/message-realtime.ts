import type { MessageHistoryResponse } from "@map-chat/contracts";
import type { InfiniteData, QueryClient } from "@tanstack/react-query";
import {
  fetchMessageHistoryPage,
  mergeMessageHistoryPage,
  messageHistoryQueryKey,
  newestMessageCursor
} from "./message-history";

type MessageHistoryData = InfiniteData<MessageHistoryResponse, string | null>;

export type MessageCatchUpResult = Readonly<{
  mode: "newest" | "after";
  pageCount: number;
}>;

export async function catchUpMessageHistory({
  queryClient,
  roomId,
  isCurrent,
  fetchPage = fetchMessageHistoryPage
}: {
  queryClient: QueryClient;
  roomId: string;
  isCurrent: () => boolean;
  fetchPage?: typeof fetchMessageHistoryPage;
}): Promise<MessageCatchUpResult> {
  const queryKey = messageHistoryQueryKey(roomId);
  let cursor = newestMessageCursor(queryClient.getQueryData<MessageHistoryData>(queryKey));

  if (!cursor) {
    const page = await fetchPage({ roomId });
    if (!isCurrent()) return { mode: "newest", pageCount: 0 };
    queryClient.setQueryData<MessageHistoryData>(queryKey, (current) =>
      mergeMessageHistoryPage(current, page, null)
    );
    return { mode: "newest", pageCount: 1 };
  }

  let pageCount = 0;
  let hasNewer = true;
  while (hasNewer && isCurrent()) {
    const requestedCursor: string = cursor;
    const page = await fetchPage({ roomId, after: requestedCursor, limit: 30 });
    if (!isCurrent()) break;

    queryClient.setQueryData<MessageHistoryData>(queryKey, (current) =>
      mergeMessageHistoryPage(current, page, requestedCursor)
    );
    pageCount += 1;
    hasNewer = page.pageInfo.hasNewer;
    const nextCursor = page.pageInfo.endCursor;
    if (hasNewer && (!nextCursor || nextCursor === requestedCursor)) {
      throw new Error("Message catch-up did not advance its cursor");
    }
    if (nextCursor) cursor = nextCursor;
  }

  return { mode: "after", pageCount };
}
