import type { MessageHistoryResponse, PublicMessage } from "@map-chat/contracts";
import { QueryClient, QueryClientProvider, type InfiniteData } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PropsWithChildren } from "react";
import { upsertCanonicalMessage } from "@/lib/message-create";
import { messageHistoryQueryKey } from "@/lib/message-history";
import { MessageHistoryPanel } from "./message-history-panel";

const roomA = "11111111-1111-4111-8111-111111111111";
const roomB = "22222222-2222-4222-8222-222222222222";

function message({
  id,
  roomId = roomA,
  body,
  createdAt,
  name = "Avery Stone",
  image = null
}: {
  id: string;
  roomId?: string;
  body: string;
  createdAt: string;
  name?: string;
  image?: string | null;
}): PublicMessage {
  return { id, roomId, body, createdAt, author: { name, image } };
}

function page({
  messages,
  startCursor = "start_cursor",
  endCursor = "end_cursor",
  hasOlder = false,
  hasNewer = false
}: {
  messages: PublicMessage[];
  startCursor?: string | null;
  endCursor?: string | null;
  hasOlder?: boolean;
  hasNewer?: boolean;
}): MessageHistoryResponse {
  return {
    messages,
    pageInfo: {
      startCursor: messages.length > 0 ? startCursor : null,
      endCursor: messages.length > 0 ? endCursor : null,
      hasOlder,
      hasNewer
    }
  };
}

function response(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as Response;
}

function renderHistory(roomId = roomA) {
  const client = new QueryClient({
    defaultOptions: { queries: { gcTime: Infinity, retry: false } }
  });
  const Wrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { ...render(<MessageHistoryPanel roomId={roomId} />, { wrapper: Wrapper }), client };
}

beforeEach(() => {
  Object.defineProperty(globalThis, "fetch", {
    configurable: true,
    writable: true,
    value: jest.fn()
  });
});

describe("selected-room message history panel", () => {
  it("renders newest public history as plain text with semantic author and timestamp output", async () => {
    const unsafeBody = "<img src=x onerror=alert(1)>";
    jest.mocked(fetch).mockResolvedValue(response(page({ messages: [message({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      body: unsafeBody,
      createdAt: "2026-09-17T10:00:00.000Z",
      image: "https://images.example.invalid/avery.png"
    })] })));

    renderHistory();

    expect(await screen.findByText(unsafeBody)).toBeVisible();
    expect(document.querySelector(".message-item img[src='x']")).toBeNull();
    expect(screen.getByText("Avery Stone")).toBeVisible();
    expect(screen.getByRole("time")).toHaveAttribute("datetime", "2026-09-17T10:00:00.000Z");
    expect(screen.getByRole("time")).toHaveAccessibleName(/^Sent /);
    const authorImage = document.querySelector(".message-author-image img");
    expect(authorImage).not.toBeNull();
    expect(authorImage).toHaveAttribute("referrerpolicy", "no-referrer");
    fireEvent.error(authorImage as HTMLImageElement);
    expect(screen.getByText("A", { selector: ".message-author-image" })).toBeVisible();
  });

  it("renders the guest empty state", async () => {
    jest.mocked(fetch).mockResolvedValue(response(page({ messages: [] })));
    renderHistory();
    expect(await screen.findByText("No messages in this room yet.")).toHaveAttribute("role", "status");
  });

  it("offers an accessible retry after an initial failure", async () => {
    jest.mocked(fetch)
      .mockResolvedValueOnce(response({}, false))
      .mockResolvedValueOnce(response(page({ messages: [message({
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        body: "Recovered history",
        createdAt: "2026-09-17T10:00:00.000Z"
      })] })));
    renderHistory();

    expect(await screen.findByRole("alert")).toHaveTextContent("Messages could not be loaded");
    await userEvent.setup().click(screen.getByRole("button", { name: "Retry loading messages" }));
    expect(await screen.findByText("Recovered history")).toBeVisible();
  });

  it("prepends multiple older pages chronologically, deduplicates overlap, and exhausts the control", async () => {
    const newest = message({
      id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      body: "Newest",
      createdAt: "2026-09-17T10:03:00.000Z"
    });
    const middle = message({
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      body: "Middle",
      createdAt: "2026-09-17T10:02:00.000Z"
    });
    const oldest = message({
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      body: "Oldest",
      createdAt: "2026-09-17T10:01:00.000Z"
    });
    jest.mocked(fetch)
      .mockResolvedValueOnce(response(page({ messages: [newest], startCursor: "newest_start", hasOlder: true })))
      .mockResolvedValueOnce(response(page({ messages: [middle, newest], startCursor: "middle_start", hasOlder: true, hasNewer: true })))
      .mockResolvedValueOnce(response(page({ messages: [oldest, middle], startCursor: "oldest_start", hasOlder: false, hasNewer: true })));
    renderHistory();
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Load older messages" }));
    await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(2));
    await user.click(screen.getByRole("button", { name: "Load older messages" }));
    await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(3));

    expect(screen.getAllByRole("article").map((article) => article.textContent)).toEqual([
      expect.stringContaining("Oldest"),
      expect.stringContaining("Middle"),
      expect.stringContaining("Newest")
    ]);
    expect(screen.queryByRole("button", { name: "Load older messages" })).not.toBeInTheDocument();
    expect(jest.mocked(fetch).mock.calls.map(([url]) => String(url))).toEqual([
      `/api/rooms/${roomA}/messages`,
      `/api/rooms/${roomA}/messages?before=newest_start`,
      `/api/rooms/${roomA}/messages?before=middle_start`
    ]);
  });

  it("keeps loaded history visible when an older request fails and retries that cursor", async () => {
    const newest = message({
      id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      body: "Still visible",
      createdAt: "2026-09-17T10:03:00.000Z"
    });
    const older = message({
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      body: "Recovered older",
      createdAt: "2026-09-17T10:02:00.000Z"
    });
    jest.mocked(fetch)
      .mockResolvedValueOnce(response(page({ messages: [newest], startCursor: "retry_cursor", hasOlder: true })))
      .mockResolvedValueOnce(response({}, false))
      .mockResolvedValueOnce(response(page({ messages: [older], hasOlder: false, hasNewer: true })));
    renderHistory();
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Load older messages" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Your current history is still available");
    expect(screen.getByText("Still visible")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Retry older messages" }));
    expect(await screen.findByText("Recovered older")).toBeVisible();
    expect(screen.getByText("Still visible")).toBeVisible();
  });

  it("preserves the visible scroll anchor when older messages are prepended", async () => {
    const newest = message({
      id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      body: "Newest",
      createdAt: "2026-09-17T10:03:00.000Z"
    });
    const older = message({
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      body: "Older",
      createdAt: "2026-09-17T10:02:00.000Z"
    });
    let resolveOlder!: (value: Response) => void;
    jest.mocked(fetch)
      .mockResolvedValueOnce(response(page({ messages: [newest], startCursor: "older_cursor", hasOlder: true })))
      .mockReturnValueOnce(new Promise((resolve) => { resolveOlder = resolve; }));
    renderHistory();

    const list = await screen.findByRole("log", { name: "Room message history" });
    let height = 400;
    Object.defineProperty(list, "scrollHeight", { configurable: true, get: () => height });
    list.scrollTop = 120;
    await userEvent.setup().click(screen.getByRole("button", { name: "Load older messages" }));
    height = 640;
    await act(async () => resolveOlder(response(page({ messages: [older], hasOlder: false, hasNewer: true }))));
    await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(2));
    expect(list.scrollTop).toBe(360);
    expect(screen.queryByRole("button", { name: /New messages/ })).not.toBeInTheDocument();
  });

  it("auto-scrolls a confirmed message only when the reader is near the bottom", async () => {
    const first = message({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      body: "Already visible",
      createdAt: "2026-09-17T10:00:00.000Z"
    });
    const incoming = message({
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      body: "Near-bottom arrival",
      createdAt: "2026-09-17T10:01:00.000Z"
    });
    jest.mocked(fetch).mockResolvedValue(response(page({ messages: [first] })));
    const { client } = renderHistory();
    const list = await screen.findByRole("log", { name: "Room message history" });
    let height = 600;
    Object.defineProperty(list, "scrollHeight", { configurable: true, get: () => height });
    Object.defineProperty(list, "clientHeight", { configurable: true, value: 200 });
    list.scrollTop = 330;
    fireEvent.scroll(list);
    height = 700;

    await act(async () => client.setQueryData<InfiniteData<MessageHistoryResponse, string | null>>(
      messageHistoryQueryKey(roomA),
      (current) => current ? upsertCanonicalMessage(current, incoming) : current
    ));

    expect(await screen.findByText("Near-bottom arrival")).toBeVisible();
    expect(list.scrollTop).toBe(700);
    expect(screen.queryByRole("button", { name: /New messages/ })).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Latest message shown");
  });

  it("retains a non-bottom position, counts only new IDs, and moves on explicit request without stealing focus", async () => {
    const first = message({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      body: "Reading here",
      createdAt: "2026-09-17T10:00:00.000Z"
    });
    const incoming = message({
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      body: "Waits below",
      createdAt: "2026-09-17T10:01:00.000Z"
    });
    jest.mocked(fetch).mockResolvedValue(response(page({
      messages: [first],
      startCursor: "older_cursor",
      hasOlder: true
    })));
    const { client } = renderHistory();
    const list = await screen.findByRole("log", { name: "Room message history" });
    let height = 600;
    Object.defineProperty(list, "scrollHeight", { configurable: true, get: () => height });
    Object.defineProperty(list, "clientHeight", { configurable: true, value: 200 });
    list.scrollTop = 80;
    fireEvent.scroll(list);
    const olderControl = screen.getByRole("button", { name: "Load older messages" });
    olderControl.focus();
    height = 700;

    await act(async () => client.setQueryData<InfiniteData<MessageHistoryResponse, string | null>>(
      messageHistoryQueryKey(roomA),
      (current) => current ? upsertCanonicalMessage(current, incoming) : current
    ));

    expect(await screen.findByText("Waits below")).toBeVisible();
    expect(list.scrollTop).toBe(80);
    expect(olderControl).toHaveFocus();
    const newMessages = screen.getByRole("button", { name: "New messages (1)" });
    expect(screen.getByRole("status")).toHaveTextContent("1 new message is available below");

    await act(async () => client.setQueryData<InfiniteData<MessageHistoryResponse, string | null>>(
      messageHistoryQueryKey(roomA),
      (current) => current ? upsertCanonicalMessage(current, incoming) : current
    ));
    expect(screen.getByRole("button", { name: "New messages (1)" })).toBeVisible();

    await userEvent.setup().click(newMessages);
    expect(list.scrollTop).toBe(700);
    expect(list).toHaveFocus();
    expect(screen.queryByRole("button", { name: /New messages/ })).not.toBeInTheDocument();
  });

  it("clears the unread control and stale announcement after manually scrolling near the bottom", async () => {
    const first = message({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      body: "Reading above",
      createdAt: "2026-09-17T10:00:00.000Z"
    });
    const incoming = message({
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      body: "Arrived below",
      createdAt: "2026-09-17T10:01:00.000Z"
    });
    jest.mocked(fetch).mockResolvedValue(response(page({ messages: [first] })));
    const { client } = renderHistory();
    const list = await screen.findByRole("log", { name: "Room message history" });
    Object.defineProperty(list, "scrollHeight", { configurable: true, value: 700 });
    Object.defineProperty(list, "clientHeight", { configurable: true, value: 200 });
    list.scrollTop = 80;
    fireEvent.scroll(list);

    await act(async () => client.setQueryData<InfiniteData<MessageHistoryResponse, string | null>>(
      messageHistoryQueryKey(roomA),
      (current) => current ? upsertCanonicalMessage(current, incoming) : current
    ));

    expect(await screen.findByRole("button", { name: "New messages (1)" })).toBeVisible();
    const liveRegion = screen.getByRole("status");
    expect(liveRegion).toHaveTextContent("1 new message is available below");

    list.scrollTop = 440;
    fireEvent.scroll(list);

    expect(screen.queryByRole("button", { name: /New messages/ })).not.toBeInTheDocument();
    expect(liveRegion).toHaveTextContent("Latest messages shown.");
    expect(liveRegion).not.toHaveTextContent("available below");

    fireEvent.scroll(list);
    expect(liveRegion).toHaveTextContent("Latest messages shown.");
  });

  it("never renders a late previous-room response after switching rooms", async () => {
    let resolveRoomA!: (value: Response) => void;
    jest.mocked(fetch)
      .mockReturnValueOnce(new Promise((resolve) => { resolveRoomA = resolve; }))
      .mockResolvedValueOnce(response(page({ messages: [message({
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        roomId: roomB,
        body: "Room B history",
        createdAt: "2026-09-17T11:00:00.000Z"
      })] })));
    const { rerender } = renderHistory(roomA);

    rerender(<MessageHistoryPanel roomId={roomB} />);
    expect(await screen.findByText("Room B history")).toBeVisible();
    await act(async () => resolveRoomA(response(page({ messages: [message({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      body: "Late room A history",
      createdAt: "2026-09-17T10:00:00.000Z"
    })] }))));

    await waitFor(() => expect(screen.queryByText("Late room A history")).not.toBeInTheDocument());
    expect(screen.getByText("Room B history")).toBeVisible();
  });

  it("keeps a late older-page result in its original room cache", async () => {
    const roomANewest = message({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      body: "Room A newest",
      createdAt: "2026-09-17T10:01:00.000Z"
    });
    let resolveRoomAOlder!: (value: Response) => void;
    jest.mocked(fetch)
      .mockResolvedValueOnce(response(page({ messages: [roomANewest], startCursor: "room_a_older", hasOlder: true })))
      .mockReturnValueOnce(new Promise((resolve) => { resolveRoomAOlder = resolve; }))
      .mockResolvedValueOnce(response(page({ messages: [message({
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        roomId: roomB,
        body: "Room B current",
        createdAt: "2026-09-17T11:00:00.000Z"
      })] })));
    const { rerender } = renderHistory(roomA);

    await userEvent.setup().click(await screen.findByRole("button", { name: "Load older messages" }));
    rerender(<MessageHistoryPanel roomId={roomB} />);
    expect(await screen.findByText("Room B current")).toBeVisible();
    await act(async () => resolveRoomAOlder(response(page({ messages: [message({
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      body: "Room A late older",
      createdAt: "2026-09-17T10:00:00.000Z"
    })], hasOlder: false, hasNewer: true }))));

    expect(screen.queryByText("Room A newest")).not.toBeInTheDocument();
    expect(screen.queryByText("Room A late older")).not.toBeInTheDocument();
    expect(screen.getByText("Room B current")).toBeVisible();
  });

  it("discards room A's scroll anchor when switching to cached multi-page room B", async () => {
    const roomANewest = message({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      body: "Room A newest",
      createdAt: "2026-09-17T10:01:00.000Z"
    });
    const roomBOlder = message({
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      roomId: roomB,
      body: "Room B older cached",
      createdAt: "2026-09-17T10:30:00.000Z"
    });
    const roomBNewest = message({
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      roomId: roomB,
      body: "Room B newest cached",
      createdAt: "2026-09-17T11:00:00.000Z"
    });
    let resolveRoomAOlder!: (value: Response) => void;
    jest.mocked(fetch)
      .mockResolvedValueOnce(response(page({ messages: [roomANewest], startCursor: "room_a_older", hasOlder: true })))
      .mockReturnValueOnce(new Promise((resolve) => { resolveRoomAOlder = resolve; }));
    const { client, rerender } = renderHistory(roomA);
    client.setQueryDefaults(messageHistoryQueryKey(roomB), { staleTime: Infinity });
    client.setQueryData(messageHistoryQueryKey(roomB), {
      pages: [
        page({ messages: [roomBOlder], startCursor: "room_b_oldest", hasOlder: false, hasNewer: true }),
        page({ messages: [roomBNewest], startCursor: "room_b_newest", hasOlder: true })
      ],
      pageParams: ["room_b_older", null]
    });

    const list = await screen.findByRole("log", { name: "Room message history" });
    let height = 400;
    Object.defineProperty(list, "scrollHeight", { configurable: true, get: () => height });
    list.scrollTop = 120;
    await userEvent.setup().click(screen.getByRole("button", { name: "Load older messages" }));

    list.scrollTop = 55;
    height = 700;
    rerender(<MessageHistoryPanel roomId={roomB} />);
    expect(await screen.findByText("Room B older cached")).toBeVisible();
    expect(screen.getByText("Room B newest cached")).toBeVisible();
    expect(list.scrollTop).toBe(55);

    await act(async () => resolveRoomAOlder(response(page({ messages: [message({
      id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      body: "Room A late older",
      createdAt: "2026-09-17T10:00:00.000Z"
    })], hasOlder: false, hasNewer: true }))));

    expect(screen.queryByText("Room A newest")).not.toBeInTheDocument();
    expect(screen.queryByText("Room A late older")).not.toBeInTheDocument();
    expect(screen.getByText("Room B older cached")).toBeVisible();
    expect(screen.getByText("Room B newest cached")).toBeVisible();
    expect(list.scrollTop).toBe(55);
  });
});
