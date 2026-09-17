import type { MessageHistoryResponse, PublicMessage } from "@map-chat/contracts";
import { QueryClient, QueryClientProvider, type InfiniteData } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PropsWithChildren } from "react";
import type { AuthSession } from "@/lib/auth-client";
import type { AuthSessionState } from "@/lib/auth-session";
import { messageCreateAttemptsQueryKey, messageDraftsQueryKey, type MessageCreateAttempt } from "@/lib/message-create";
import { messageHistoryQueryKey } from "@/lib/message-history";
import { MessageComposer } from "./message-composer";

const roomA = "11111111-1111-4111-8111-111111111111";
const roomB = "22222222-2222-4222-8222-222222222222";
const requestA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const requestB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const signedIn = {
  status: "signed-in",
  session: {
    session: { id: "session-id", userId: "private-user-id" },
    user: { id: "private-user-id", name: "Avery Stone", email: "private@example.invalid", image: null }
  } as AuthSession
} satisfies AuthSessionState;

function canonical({
  id = "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  roomId = roomA,
  body = "Hello map",
  clientRequestId = requestA
} = {}) {
  return {
    id,
    roomId,
    body,
    createdAt: "2026-09-17T10:00:00.000Z",
    author: { name: "Avery Stone", image: null },
    clientRequestId
  };
}

function response(status: number, body: unknown): Response {
  return { status, json: async () => body } as Response;
}

function emptyHistory(): InfiniteData<MessageHistoryResponse, string | null> {
  return {
    pages: [{
      messages: [],
      pageInfo: { startCursor: null, endCursor: null, hasOlder: false, hasNewer: false }
    }],
    pageParams: [null]
  };
}

function renderComposer({
  roomId = roomA,
  auth = signedIn,
  onSignIn = jest.fn(async () => undefined),
  ids = [requestA, requestB]
}: {
  roomId?: string;
  auth?: AuthSessionState;
  onSignIn?: () => Promise<void>;
  ids?: string[];
} = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retry: false }, mutations: { retry: false } } });
  client.setQueryData(messageHistoryQueryKey(roomA), emptyHistory());
  client.setQueryData(messageHistoryQueryKey(roomB), emptyHistory());
  const generateClientRequestId = jest.fn();
  for (const id of ids) generateClientRequestId.mockReturnValueOnce(id);
  const Wrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const view = render(
    <MessageComposer roomId={roomId} auth={auth} onSignIn={onSignIn} generateClientRequestId={generateClientRequestId} />,
    { wrapper: Wrapper }
  );
  return {
    ...view,
    client,
    generateClientRequestId,
    rerenderComposer: (nextRoomId: string, nextAuth: AuthSessionState = auth) => view.rerender(
      <MessageComposer roomId={nextRoomId} auth={nextAuth} onSignIn={onSignIn} generateClientRequestId={generateClientRequestId} />
    )
  };
}

async function submit(body: string) {
  const user = userEvent.setup();
  const input = screen.getByRole("textbox", { name: "Message" });
  await user.type(input, body);
  await user.click(screen.getByRole("button", { name: "Send message" }));
}

beforeEach(() => {
  Object.defineProperty(globalThis, "fetch", {
    configurable: true,
    writable: true,
    value: jest.fn()
  });
});

afterEach(() => jest.restoreAllMocks());

describe("authenticated optimistic message composer", () => {
  it("keeps public history independent while exposing loading, auth-error, and guest actions", async () => {
    const retry = jest.fn(async () => undefined);
    const onSignIn = jest.fn(async () => undefined);
    const view = renderComposer({ auth: { status: "loading" }, onSignIn });
    expect(screen.getByRole("status")).toHaveTextContent("Checking whether you can send messages");
    expect(screen.queryByRole("textbox", { name: "Message" })).not.toBeInTheDocument();

    view.rerenderComposer(roomA, { status: "error", error: {} as never, retry });
    await userEvent.setup().click(screen.getByRole("button", { name: "Retry session check" }));
    expect(retry).toHaveBeenCalledTimes(1);

    view.rerenderComposer(roomA, { status: "signed-out" });
    expect(screen.getByText(/Public history remains available\./)).toBeVisible();
    await userEvent.setup().click(screen.getByRole("button", { name: "Continue with Google" }));
    expect(onSignIn).toHaveBeenCalledTimes(1);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("validates normalized plain text and submits from the keyboard", async () => {
    jest.mocked(fetch).mockResolvedValueOnce(response(201, canonical({ body: "Keyboard message" })));
    renderComposer();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Send message" }));
    expect(screen.getByRole("alert")).toHaveTextContent("between 1 and 1000 characters");
    fireEvent.change(screen.getByRole("textbox", { name: "Message" }), { target: { value: "x".repeat(1001) } });
    await user.click(screen.getByRole("button", { name: "Send message" }));
    expect(fetch).not.toHaveBeenCalled();

    fireEvent.change(screen.getByRole("textbox", { name: "Message" }), { target: { value: "  Keyboard message  " } });
    screen.getByRole("button", { name: "Send message" }).focus();
    await user.keyboard("{Enter}");
    expect(await screen.findByText("Message sent.")).toBeVisible();
    expect(JSON.parse(String(jest.mocked(fetch).mock.calls[0]?.[1]?.body))).toEqual({
      body: "Keyboard message",
      clientRequestId: requestA
    });
  });

  it("renders one pending attempt immediately and blocks an accidental duplicate body", async () => {
    let resolve!: (value: Response) => void;
    jest.mocked(fetch).mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    const view = renderComposer();
    await submit("Still sending");

    expect(screen.getByText("Still sending")).toBeVisible();
    expect(screen.getByText("Waiting for server confirmation.")).toHaveAttribute("role", "status");
    fireEvent.change(screen.getByRole("textbox", { name: "Message" }), { target: { value: "Still sending" } });
    await userEvent.setup().click(screen.getByRole("button", { name: "Send message" }));
    expect(screen.getByRole("alert")).toHaveTextContent("already being sent");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(view.client.getQueryData(messageHistoryQueryKey(roomA))).toEqual(emptyHistory());

    await act(async () => resolve(response(201, canonical({ body: "Still sending" }))));
    expect(await screen.findByText("Message sent.")).toBeVisible();
  });

  it.each([201, 200] as const)("reconciles HTTP %i exactly once and announces only after confirmation", async (status) => {
    let resolve!: (value: Response) => void;
    jest.mocked(fetch).mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    const view = renderComposer();
    await submit("Canonical result");
    expect(screen.queryByText("Message sent.")).not.toBeInTheDocument();

    await act(async () => resolve(response(status, canonical({ body: "Canonical result" }))));
    expect(await screen.findByText("Message sent.")).toBeVisible();
    expect(screen.queryByText("Waiting for server confirmation.")).not.toBeInTheDocument();
    const history = view.client.getQueryData<InfiniteData<MessageHistoryResponse, string | null>>(messageHistoryQueryKey(roomA));
    expect(history?.pages.flatMap((page) => page.messages)).toEqual([
      expect.objectContaining({ id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", body: "Canonical result" })
    ]);
  });

  it.each([
    [400, { error: { code: "INVALID_MESSAGE_REQUEST", message: "Invalid message request" } }, "This message is invalid"],
    [401, { error: { code: "UNAUTHORIZED", message: "Authentication required" } }, "Please sign in again"],
    [404, { error: { code: "ROOM_NOT_FOUND", message: "Room not found" } }, "room is no longer available"],
    [409, { error: { code: "MESSAGE_REQUEST_CONFLICT", message: "Request ID already used with a different message" } }, "retry ID was already used"],
    [429, { error: { code: "MESSAGE_RATE_LIMITED", message: "Message rate limit exceeded", retryAfterSeconds: 17 } }, "17 seconds"],
    [503, { error: { code: "MESSAGE_RATE_LIMIT_UNAVAILABLE", message: "Message sending is temporarily unavailable", retryable: true } }, "temporarily unavailable"],
    [500, { error: { code: "UNEXPECTED_INTERNAL", message: "private detail" } }, "unexpected response"]
  ])("retains only the targeted attempt after HTTP %i", async (status, body, feedback) => {
    jest.mocked(fetch).mockResolvedValueOnce(response(status, body));
    const view = renderComposer();
    await submit("Retained plain text");

    expect(await screen.findByRole("alert")).toHaveTextContent(feedback);
    expect(screen.getByText("Retained plain text")).toBeVisible();
    expect(screen.queryByText("private detail")).not.toBeInTheDocument();
    expect(view.client.getQueryData<MessageCreateAttempt[]>(messageCreateAttemptsQueryKey)).toEqual([
      expect.objectContaining({ clientRequestId: requestA, body: "Retained plain text", status: "failed" })
    ]);
  });

  it("maps network failure without exposing transport details", async () => {
    jest.mocked(fetch).mockRejectedValueOnce(new TypeError("private network detail"));
    renderComposer();
    await submit("Offline message");
    expect(await screen.findByRole("alert")).toHaveTextContent("network connection was lost");
    expect(screen.queryByText("private network detail")).not.toBeInTheDocument();
  });

  it("retries a rate-limited attempt with the stable ID and bounded feedback", async () => {
    jest.mocked(fetch)
      .mockResolvedValueOnce(response(429, {
        error: { code: "MESSAGE_RATE_LIMITED", message: "Message rate limit exceeded", retryAfterSeconds: 17 }
      }))
      .mockResolvedValueOnce(response(200, canonical({ body: "Retry me" })));
    renderComposer();
    await submit("Retry me");
    expect(await screen.findByRole("alert")).toHaveTextContent("17 seconds");
    await userEvent.setup().click(screen.getByRole("button", { name: "Retry sending message" }));
    expect(await screen.findByText("Message sent.")).toBeVisible();

    const requestIds = jest.mocked(fetch).mock.calls.map((call) =>
      (JSON.parse(String(call[1]?.body)) as { clientRequestId: string }).clientRequestId
    );
    expect(requestIds).toEqual([requestA, requestA]);
  });

  it("uses a new ID for a restarted conflict", async () => {
    jest.mocked(fetch)
      .mockResolvedValueOnce(response(409, {
        error: { code: "MESSAGE_REQUEST_CONFLICT", message: "Request ID already used with a different message" }
      }))
      .mockResolvedValueOnce(response(201, canonical({ body: "Restart me", clientRequestId: requestB })));
    renderComposer();
    await submit("Restart me");
    await userEvent.setup().click(await screen.findByRole("button", { name: "Start a new attempt" }));
    expect(await screen.findByText("Message sent.")).toBeVisible();
    expect(jest.mocked(fetch).mock.calls.map((call) =>
      (JSON.parse(String(call[1]?.body)) as { clientRequestId: string }).clientRequestId
    )).toEqual([requestA, requestB]);
  });

  it("restores failed text for editing and uses a new ID for the edited submission", async () => {
    jest.mocked(fetch)
      .mockResolvedValueOnce(response(400, {
        error: { code: "INVALID_MESSAGE_REQUEST", message: "Invalid message request" }
      }))
      .mockResolvedValueOnce(response(201, canonical({ body: "Edited message", clientRequestId: requestB })));
    renderComposer();
    await submit("Original message");
    await userEvent.setup().click(await screen.findByRole("button", { name: "Edit message" }));
    const input = screen.getByRole("textbox", { name: "Message" });
    expect(input).toHaveValue("Original message");
    await waitFor(() => expect(input).toHaveFocus());
    await userEvent.setup().clear(input);
    await userEvent.setup().type(input, "Edited message");
    await userEvent.setup().click(screen.getByRole("button", { name: "Send message" }));
    expect(await screen.findByText("Message sent.")).toBeVisible();
    expect(jest.mocked(fetch).mock.calls.map((call) =>
      (JSON.parse(String(call[1]?.body)) as { clientRequestId: string }).clientRequestId
    )).toEqual([requestA, requestB]);
  });

  it("preserves a second pending attempt and a concurrent history update when the first fails", async () => {
    let rejectFirst!: (reason: unknown) => void;
    let resolveSecond!: (value: Response) => void;
    jest.mocked(fetch)
      .mockReturnValueOnce(new Promise((_resolve, reject) => { rejectFirst = reject; }))
      .mockReturnValueOnce(new Promise((resolve) => { resolveSecond = resolve; }));
    const view = renderComposer();
    await submit("First pending");
    await submit("Second pending");
    const concurrent: PublicMessage = {
      id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      roomId: roomA,
      body: "Concurrent canonical",
      createdAt: "2026-09-17T09:59:00.000Z",
      author: { name: "Morgan", image: null }
    };
    view.client.setQueryData<InfiniteData<MessageHistoryResponse, string | null>>(messageHistoryQueryKey(roomA), {
      pages: [{
        messages: [concurrent],
        pageInfo: { startCursor: "start", endCursor: "end", hasOlder: false, hasNewer: false }
      }],
      pageParams: [null]
    });

    await act(async () => rejectFirst(new TypeError("offline")));
    expect(await screen.findByText("First pending")).toBeVisible();
    expect(screen.getByText("Second pending")).toBeVisible();
    await act(async () => resolveSecond(response(201, canonical({
      id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      body: "Second pending",
      clientRequestId: requestB
    }))));

    await waitFor(() => expect(screen.queryByText("Second pending")).not.toBeInTheDocument());
    expect(screen.getByText("First pending")).toBeVisible();
    const history = view.client.getQueryData<InfiniteData<MessageHistoryResponse, string | null>>(messageHistoryQueryKey(roomA));
    expect(history?.pages.flatMap((page) => page.messages).map((message) => message.body)).toEqual([
      "Concurrent canonical",
      "Second pending"
    ]);
  });

  it("keeps a new-room draft and focus while a late old-room success updates only its origin", async () => {
    let resolveOld!: (value: Response) => void;
    jest.mocked(fetch).mockReturnValueOnce(new Promise((resolve) => { resolveOld = resolve; }));
    const view = renderComposer();
    await submit("Room A pending");
    view.rerenderComposer(roomB);
    const roomBInput = screen.getByRole("textbox", { name: "Message" });
    await userEvent.setup().type(roomBInput, "Room B draft");
    roomBInput.focus();

    await act(async () => resolveOld(response(201, canonical({ body: "Room A pending" }))));
    expect(screen.getByRole("textbox", { name: "Message" })).toHaveValue("Room B draft");
    expect(screen.getByRole("textbox", { name: "Message" })).toHaveFocus();
    expect(screen.queryByText("Message sent.")).not.toBeInTheDocument();
    expect(screen.queryByText("Room A pending")).not.toBeInTheDocument();
    expect(view.client.getQueryData<InfiniteData<MessageHistoryResponse, string | null>>(messageHistoryQueryKey(roomA))?.pages[0]?.messages)
      .toEqual([expect.objectContaining({ body: "Room A pending" })]);
    expect(view.client.getQueryData<Record<string, string>>(messageDraftsQueryKey)?.[roomB]).toBe("Room B draft");
  });

  it("keeps a new-room draft and focus while a late old-room failure remains targeted", async () => {
    let rejectOld!: (reason: unknown) => void;
    jest.mocked(fetch).mockReturnValueOnce(new Promise((_resolve, reject) => { rejectOld = reject; }));
    const view = renderComposer();
    await submit("Room A will fail");
    view.rerenderComposer(roomB);
    const roomBInput = screen.getByRole("textbox", { name: "Message" });
    await userEvent.setup().type(roomBInput, "Untouched B draft");
    roomBInput.focus();

    await act(async () => rejectOld(new TypeError("offline")));
    expect(screen.getByRole("textbox", { name: "Message" })).toHaveValue("Untouched B draft");
    expect(screen.getByRole("textbox", { name: "Message" })).toHaveFocus();
    expect(screen.queryByText("Room A will fail")).not.toBeInTheDocument();
    expect(view.client.getQueryData<MessageCreateAttempt[]>(messageCreateAttemptsQueryKey)).toEqual([
      expect.objectContaining({ roomId: roomA, body: "Room A will fail", status: "failed" })
    ]);
  });
});
