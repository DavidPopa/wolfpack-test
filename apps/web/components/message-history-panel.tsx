"use client";

import type { MessageHistoryResponse, PublicMessage } from "@map-chat/contracts";
import { useInfiniteQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  fetchMessageHistoryPage,
  flattenMessageHistory,
  mergeNewestMessagePage,
  messageHistoryQueryKey
} from "@/lib/message-history";
import { Button } from "./ui/button";

const NEAR_BOTTOM_THRESHOLD = 72;

const formatTimestamp = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short"
});

function isNearBottom(element: HTMLDivElement) {
  return element.scrollHeight - element.scrollTop - element.clientHeight <= NEAR_BOTTOM_THRESHOLD;
}

function AuthorImage({ message }: { message: PublicMessage }) {
  const [failed, setFailed] = useState(false);
  const initial = message.author.name.trim().charAt(0).toUpperCase() || "?";

  return <span className="message-author-image" aria-hidden="true">
    {message.author.image && !failed
      ? <img
          src={message.author.image}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      : initial}
  </span>;
}

export function MessageHistoryPanel({ roomId }: { roomId: string }) {
  const queryClient = useQueryClient();
  const history = useInfiniteQuery({
    queryKey: messageHistoryQueryKey(roomId),
    queryFn: async ({ pageParam, signal }) => {
      const page = await fetchMessageHistoryPage({
        roomId,
        signal,
        ...(pageParam ? { before: pageParam } : {})
      });
      if (pageParam) return page;
      return mergeNewestMessagePage(
        page,
        queryClient.getQueryData<InfiniteData<MessageHistoryResponse, string | null>>(
          messageHistoryQueryKey(roomId)
        )
      );
    },
    initialPageParam: null as string | null,
    getPreviousPageParam: (firstPage) => firstPage.pageInfo.hasOlder
      ? firstPage.pageInfo.startCursor ?? undefined
      : undefined,
    getNextPageParam: () => undefined,
    refetchOnReconnect: false,
    retry: false
  });
  const messages = useMemo(
    () => flattenMessageHistory(history.data?.pages ?? []),
    [history.data?.pages]
  );
  const listRef = useRef<HTMLDivElement>(null);
  const previousMessagesRef = useRef<{ roomId: string; ids: Set<string> } | null>(null);
  const nearBottomRef = useRef(true);
  const hasUnreadMessagesRef = useRef(false);
  const [newMessageCount, setNewMessageCount] = useState(0);
  const [newMessageAnnouncement, setNewMessageAnnouncement] = useState("");
  const scrollAnchorRef = useRef<{
    roomId: string;
    height: number;
    top: number;
    pageCount: number;
  } | null>(null);

  useLayoutEffect(() => {
    const anchor = scrollAnchorRef.current;
    const list = listRef.current;
    if (!list) return;

    const currentIds = new Set(messages.map((message) => message.id));
    const previous = previousMessagesRef.current;
    if (!previous) {
      scrollAnchorRef.current = null;
      previousMessagesRef.current = { roomId, ids: currentIds };
      nearBottomRef.current = true;
      hasUnreadMessagesRef.current = false;
      setNewMessageCount(0);
      setNewMessageAnnouncement("");
      list.scrollTop = list.scrollHeight;
      return;
    }
    if (previous.roomId !== roomId) {
      scrollAnchorRef.current = null;
      previousMessagesRef.current = { roomId, ids: currentIds };
      nearBottomRef.current = isNearBottom(list);
      hasUnreadMessagesRef.current = false;
      setNewMessageCount(0);
      setNewMessageAnnouncement("");
      return;
    }

    if (history.isFetchingPreviousPage) return;
    if (anchor) {
      if (anchor.roomId === roomId && (history.data?.pages.length ?? 0) > anchor.pageCount) {
        list.scrollTop = anchor.top + (list.scrollHeight - anchor.height);
      }
      scrollAnchorRef.current = null;
      previousMessagesRef.current = { roomId, ids: currentIds };
      nearBottomRef.current = isNearBottom(list);
      return;
    }

    const addedCount = messages.reduce(
      (count, message) => count + (previous.ids.has(message.id) ? 0 : 1),
      0
    );
    previousMessagesRef.current = { roomId, ids: currentIds };
    if (addedCount === 0) return;

    if (nearBottomRef.current) {
      list.scrollTop = list.scrollHeight;
      hasUnreadMessagesRef.current = false;
      setNewMessageCount(0);
      setNewMessageAnnouncement(addedCount === 1
        ? "New message received. Latest message shown."
        : `${addedCount} new messages received. Latest messages shown.`);
      return;
    }

    hasUnreadMessagesRef.current = true;
    setNewMessageCount((count) => count + addedCount);
    setNewMessageAnnouncement(addedCount === 1
      ? "1 new message is available below."
      : `${addedCount} new messages are available below.`);
  }, [history.data?.pages.length, history.isFetchingPreviousPage, messages, roomId]);

  const loadOlder = () => {
    const list = listRef.current;
    if (list) {
      scrollAnchorRef.current = {
        roomId,
        height: list.scrollHeight,
        top: list.scrollTop,
        pageCount: history.data?.pages.length ?? 0
      };
    }
    void history.fetchPreviousPage();
  };

  const showLatestMessages = () => {
    const list = listRef.current;
    if (!list) return;
    list.scrollTop = list.scrollHeight;
    nearBottomRef.current = true;
    hasUnreadMessagesRef.current = false;
    setNewMessageCount(0);
    setNewMessageAnnouncement("Latest messages shown.");
    list.focus({ preventScroll: true });
  };

  if (history.isPending) {
    return <div className="message-history message-history--state" role="status" aria-live="polite">
      <span className="status-mark" aria-hidden="true" />
      Loading messages…
    </div>;
  }

  if (history.isError && !history.data) {
    return <div className="message-history message-history--state" role="alert">
      <p>Messages could not be loaded. Check your connection and try again.</p>
      <Button type="button" variant="secondary" onClick={() => void history.refetch()}>
        Retry loading messages
      </Button>
    </div>;
  }

  if (messages.length === 0) {
    return <p className="message-history message-history--empty" role="status">No messages in this room yet.</p>;
  }

  return <div className="message-history">
    <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
      {newMessageAnnouncement}
    </span>
    {history.hasPreviousPage && !history.isFetchPreviousPageError && <Button
      type="button"
      variant="secondary"
      disabled={history.isFetchingPreviousPage}
      aria-describedby={history.isFetchPreviousPageError ? "older-message-error" : undefined}
      onClick={loadOlder}
    >
      {history.isFetchingPreviousPage ? "Loading older messages…" : "Load older messages"}
    </Button>}
    {history.isFetchPreviousPageError && <div id="older-message-error" className="message-history__error" role="alert">
      <p>Older messages could not be loaded. Your current history is still available.</p>
      <Button type="button" variant="secondary" onClick={loadOlder}>Retry older messages</Button>
    </div>}
    {newMessageCount > 0 && <Button
      type="button"
      variant="secondary"
      className="message-history__new-messages"
      onClick={showLatestMessages}
    >
      New messages ({newMessageCount})
    </Button>}
    <div
      ref={listRef}
      className="message-list"
      role="log"
      aria-label="Room message history"
      aria-live="off"
      tabIndex={-1}
      onScroll={(event) => {
        nearBottomRef.current = isNearBottom(event.currentTarget);
        if (nearBottomRef.current && hasUnreadMessagesRef.current) {
          hasUnreadMessagesRef.current = false;
          setNewMessageCount(0);
          setNewMessageAnnouncement("Latest messages shown.");
        }
      }}
    >
      {messages.map((message) => <article className="message-item" key={message.id}>
        <header>
          <AuthorImage message={message} />
          <strong>{message.author.name}</strong>
          <time
            dateTime={message.createdAt}
            aria-label={`Sent ${formatTimestamp.format(new Date(message.createdAt))}`}
          >
            {formatTimestamp.format(new Date(message.createdAt))}
          </time>
        </header>
        <p>{message.body}</p>
      </article>)}
    </div>
  </div>;
}
