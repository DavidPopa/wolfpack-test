import type { MessageHistoryResponse, PublicMessage } from "@map-chat/contracts";
import { QueryClient, type InfiniteData } from "@tanstack/react-query";
import { upsertCanonicalMessage } from "./message-create";
import {
  flattenMessageHistory,
  mergeNewestMessagePage,
  messageHistoryQueryKey
} from "./message-history";
import { catchUpMessageHistory } from "./message-realtime";

const roomId = "11111111-1111-4111-8111-111111111111";

function message(id: string, body: string, second: number): PublicMessage {
  return {
    id,
    roomId,
    body,
    createdAt: `2026-09-17T10:00:${String(second).padStart(2, "0")}.000Z`,
    author: { name: "Fixture author", image: null }
  };
}

function page(
  messages: PublicMessage[],
  startCursor: string | null,
  endCursor: string | null,
  hasNewer: boolean
): MessageHistoryResponse {
  return {
    messages,
    pageInfo: { startCursor, endCursor, hasOlder: startCursor !== null, hasNewer }
  };
}

describe("message reconnect catch-up", () => {
  it("retains a socket-first message when a stale initial HTTP page resolves later", () => {
    const socketMessage = message("11111111-1111-4111-8111-111111111117", "Socket first", 6);
    const current: InfiniteData<MessageHistoryResponse, string | null> = {
      pages: [page([socketMessage], null, null, false)],
      pageParams: [null]
    };

    expect(mergeNewestMessagePage(page([], null, null, false), current).messages).toEqual([socketMessage]);
  });

  it("walks every after page, retains a concurrent socket event, and deduplicates overlap", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const initial = message("11111111-1111-4111-8111-111111111112", "Initial", 1);
    const firstMissed = message("11111111-1111-4111-8111-111111111113", "First missed", 2);
    const secondMissed = message("11111111-1111-4111-8111-111111111114", "Second missed", 3);
    const concurrent = message("11111111-1111-4111-8111-111111111115", "Concurrent socket", 4);
    client.setQueryData(messageHistoryQueryKey(roomId), {
      pages: [page([initial], "cursor-0", "cursor-0", false)],
      pageParams: [null]
    });

    const fetchPage = jest.fn(async ({ after }: { after?: string; limit?: number }) => {
      if (after === "cursor-0") return page([firstMissed], "cursor-1", "cursor-1", true);
      client.setQueryData<InfiniteData<MessageHistoryResponse, string | null>>(
        messageHistoryQueryKey(roomId),
        (current) => current ? upsertCanonicalMessage(current, concurrent) : current
      );
      return page([firstMissed, secondMissed], "cursor-1", "cursor-2", false);
    });

    await expect(catchUpMessageHistory({
      queryClient: client,
      roomId,
      isCurrent: () => true,
      fetchPage: fetchPage as never
    })).resolves.toEqual({ mode: "after", pageCount: 2 });

    expect(fetchPage.mock.calls.map(([input]) => input.after)).toEqual(["cursor-0", "cursor-1"]);
    expect(fetchPage.mock.calls.map(([input]) => input.limit)).toEqual([30, 30]);
    const history = client.getQueryData<InfiniteData<MessageHistoryResponse, string | null>>(
      messageHistoryQueryKey(roomId)
    );
    expect(flattenMessageHistory(history?.pages ?? [])).toEqual([
      initial,
      firstMissed,
      secondMissed,
      concurrent
    ]);
  });

  it("performs one authoritative newest fetch without an edge and ignores a late old-room result", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    let current = true;
    let resolvePage!: (value: MessageHistoryResponse) => void;
    const fetchPage = jest.fn(() => new Promise<MessageHistoryResponse>((resolve) => {
      resolvePage = resolve;
    }));

    const recovery = catchUpMessageHistory({
      queryClient: client,
      roomId,
      isCurrent: () => current,
      fetchPage: fetchPage as never
    });
    current = false;
    resolvePage(page([message("11111111-1111-4111-8111-111111111116", "Late", 5)], null, "cursor-late", false));

    await expect(recovery).resolves.toEqual({ mode: "newest", pageCount: 0 });
    expect(fetchPage).toHaveBeenCalledTimes(1);
    expect(fetchPage).toHaveBeenCalledWith({ roomId });
    expect(client.getQueryData(messageHistoryQueryKey(roomId))).toBeUndefined();
  });

  it("fails a non-advancing multi-page response instead of creating a request storm", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(messageHistoryQueryKey(roomId), {
      pages: [page([], null, "cursor-stuck", false)],
      pageParams: [null]
    });
    const fetchPage = jest.fn(async () => page([], null, "cursor-stuck", true));

    await expect(catchUpMessageHistory({
      queryClient: client,
      roomId,
      isCurrent: () => true,
      fetchPage: fetchPage as never
    })).rejects.toThrow("did not advance");
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });
});
