"use client";

import type { PublicMessage } from "@map-chat/contracts";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  fetchMessageHistoryPage,
  flattenMessageHistory,
  messageHistoryQueryKey
} from "@/lib/message-history";
import { Button } from "./ui/button";

const formatTimestamp = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short"
});

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
  const history = useInfiniteQuery({
    queryKey: messageHistoryQueryKey(roomId),
    queryFn: ({ pageParam, signal }) => fetchMessageHistoryPage({
      roomId,
      signal,
      ...(pageParam ? { before: pageParam } : {})
    }),
    initialPageParam: null as string | null,
    getPreviousPageParam: (firstPage) => firstPage.pageInfo.hasOlder
      ? firstPage.pageInfo.startCursor ?? undefined
      : undefined,
    getNextPageParam: () => undefined,
    retry: false
  });
  const messages = useMemo(
    () => flattenMessageHistory(history.data?.pages ?? []),
    [history.data?.pages]
  );
  const listRef = useRef<HTMLDivElement>(null);
  const scrollAnchorRef = useRef<{
    roomId: string;
    height: number;
    top: number;
    pageCount: number;
  } | null>(null);

  useLayoutEffect(() => {
    const anchor = scrollAnchorRef.current;
    const list = listRef.current;
    if (!anchor || !list || history.isFetchingPreviousPage) return;
    if (anchor.roomId !== roomId) {
      scrollAnchorRef.current = null;
      return;
    }

    if ((history.data?.pages.length ?? 0) > anchor.pageCount) {
      list.scrollTop = anchor.top + (list.scrollHeight - anchor.height);
    }
    scrollAnchorRef.current = null;
  }, [history.data?.pages.length, history.isFetchingPreviousPage, messages.length, roomId]);

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
    <div
      ref={listRef}
      className="message-list"
      role="log"
      aria-label="Room message history"
      aria-live="polite"
    >
      {messages.map((message) => <article className="message-item" key={message.id}>
        <header>
          <AuthorImage message={message} />
          <strong>{message.author.name}</strong>
          <time dateTime={message.createdAt}>{formatTimestamp.format(new Date(message.createdAt))}</time>
        </header>
        <p>{message.body}</p>
      </article>)}
    </div>
  </div>;
}
