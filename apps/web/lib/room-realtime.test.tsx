import type { PublicRoom } from "@map-chat/contracts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { io } from "socket.io-client";
import {
  roomCreateAttemptsQueryKey,
  type RoomCreateAttempt
} from "./room-create";
import {
  RoomRealtimeProvider,
  useRoomRealtimeResolution,
  type RoomRealtimeResolution
} from "./room-realtime";
import { roomsQueryKey, upsertPublicRoom } from "./rooms";

type Handler = (...args: unknown[]) => void;

type MockSocket = {
  disconnect: jest.Mock<void, []>;
  io: { removeAllListeners: jest.Mock<void, []> };
  on: jest.Mock<MockSocket, [string, Handler]>;
  removeAllListeners: jest.Mock<MockSocket, []>;
};

const mockSocketHandlers = new Map<string, Set<Handler>>();
const mockManagerRemoveAllListeners = jest.fn();
const mockSocket: MockSocket = {
  disconnect: jest.fn(),
  io: { removeAllListeners: mockManagerRemoveAllListeners },
  on: jest.fn((event: string, handler: Handler): MockSocket => {
    const handlers = mockSocketHandlers.get(event) ?? new Set<Handler>();
    handlers.add(handler);
    mockSocketHandlers.set(event, handlers);
    return mockSocket;
  }),
  removeAllListeners: jest.fn((): MockSocket => {
    mockSocketHandlers.clear();
    return mockSocket;
  })
};

jest.mock("socket.io-client", () => ({ io: jest.fn(() => mockSocket) }));

const firstRoom: PublicRoom = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "First room",
  latitude: 1,
  longitude: 2,
  createdAt: "2026-09-17T10:00:00.000Z"
};
const eventRoom: PublicRoom = {
  id: "22222222-2222-4222-8222-222222222222",
  title: "Event room",
  latitude: 3,
  longitude: 4,
  createdAt: "2026-09-17T10:01:00.000Z"
};
const otherAttempt: RoomCreateAttempt = {
  clientRequestId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  coordinates: { latitude: 5, longitude: 6 },
  status: "pending"
};
const matchingAttempt: RoomCreateAttempt = {
  clientRequestId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  coordinates: { latitude: 3, longitude: 4 },
  status: "pending"
};

function emit(event: string, ...args: unknown[]) {
  for (const handler of mockSocketHandlers.get(event) ?? []) {
    (handler as (...values: unknown[]) => void)(...args);
  }
}

function ResolutionProbe({ onResolution }: { onResolution: (value: RoomRealtimeResolution) => void }) {
  useRoomRealtimeResolution(onResolution);
  return <span>probe</span>;
}

function renderProvider(client: QueryClient, child = <span>child</span>) {
  const Wrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={client}>
    <RoomRealtimeProvider>{children}</RoomRealtimeProvider>
  </QueryClientProvider>;
  return render(child, { wrapper: Wrapper });
}

beforeEach(() => {
  mockSocketHandlers.clear();
  jest.clearAllMocks();
  Object.defineProperty(globalThis, "fetch", {
    configurable: true,
    writable: true,
    value: jest.fn()
  });
});

afterEach(() => jest.restoreAllMocks());

describe("room realtime provider", () => {
  it("uses one strict handler, resolves only the matching attempt, deduplicates events, and cleans up", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(roomsQueryKey, [firstRoom]);
    client.setQueryData(roomCreateAttemptsQueryKey, [matchingAttempt, otherAttempt]);
    const onResolution = jest.fn();
    const view = renderProvider(client, <ResolutionProbe onResolution={onResolution} />);

    expect(io).toHaveBeenCalledTimes(1);
    view.rerender(<ResolutionProbe onResolution={onResolution} />);
    expect(io).toHaveBeenCalledTimes(1);
    act(() => emit("connect"));
    expect(screen.getByRole("status")).toHaveTextContent("Live room updates connected.");

    act(() => emit("room.created", {
      room: eventRoom,
      clientRequestId: matchingAttempt.clientRequestId
    }));
    expect(client.getQueryData<PublicRoom[]>(roomsQueryKey)).toEqual([firstRoom, eventRoom]);
    expect(client.getQueryData<RoomCreateAttempt[]>(roomCreateAttemptsQueryKey)).toEqual([otherAttempt]);
    expect(onResolution).toHaveBeenCalledWith({
      event: { room: eventRoom, clientRequestId: matchingAttempt.clientRequestId },
      attempt: matchingAttempt
    });

    act(() => {
      emit("room.created", { room: eventRoom, clientRequestId: matchingAttempt.clientRequestId });
      emit("room.created", { room: eventRoom, clientRequestId: matchingAttempt.clientRequestId, creatorId: "private" });
    });
    expect(client.getQueryData<PublicRoom[]>(roomsQueryKey)).toEqual([firstRoom, eventRoom]);
    expect(onResolution).toHaveBeenCalledTimes(2);

    client.setQueryData(roomsQueryKey, (existing: PublicRoom[] | undefined) =>
      upsertPublicRoom(existing, eventRoom)
    );
    client.setQueryData<RoomCreateAttempt[]>(roomCreateAttemptsQueryKey, (existing) =>
      (existing ?? []).filter((attempt) => attempt.clientRequestId !== matchingAttempt.clientRequestId)
    );
    expect(client.getQueryData<PublicRoom[]>(roomsQueryKey)?.filter((room) => room.id === eventRoom.id))
      .toHaveLength(1);

    view.unmount();
    expect(mockSocket.removeAllListeners).toHaveBeenCalledTimes(1);
    expect(mockManagerRemoveAllListeners).toHaveBeenCalledTimes(1);
    expect(mockSocket.disconnect).toHaveBeenCalledTimes(1);
  });

  it("keeps HTTP-first then socket-later reconciliation canonical and selection-neutral", () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(roomsQueryKey, [firstRoom]);
    client.setQueryData(roomCreateAttemptsQueryKey, [matchingAttempt, otherAttempt]);
    const onResolution = jest.fn();
    renderProvider(client, <ResolutionProbe onResolution={onResolution} />);

    client.setQueryData(roomsQueryKey, (existing: PublicRoom[] | undefined) =>
      upsertPublicRoom(existing, eventRoom)
    );
    client.setQueryData<RoomCreateAttempt[]>(roomCreateAttemptsQueryKey, (existing) =>
      (existing ?? []).filter((attempt) => attempt.clientRequestId !== matchingAttempt.clientRequestId)
    );
    act(() => emit("room.created", {
      room: eventRoom,
      clientRequestId: matchingAttempt.clientRequestId
    }));

    expect(client.getQueryData<PublicRoom[]>(roomsQueryKey)?.filter((room) => room.id === eventRoom.id))
      .toHaveLength(1);
    expect(client.getQueryData<RoomCreateAttempt[]>(roomCreateAttemptsQueryKey)).toEqual([otherAttempt]);
    expect(onResolution).toHaveBeenCalledWith(expect.objectContaining({ attempt: null }));
  });

  it("coalesces reconnect refresh and monotonically merges multiple missed rooms with a concurrent event", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(roomsQueryKey, [firstRoom]);
    let resolveFetch!: (response: Response) => void;
    jest.mocked(fetch).mockReturnValueOnce(new Promise((resolve) => {
      resolveFetch = resolve;
    }));
    renderProvider(client);

    act(() => {
      emit("connect");
      emit("disconnect", "transport close");
      emit("connect");
      emit("connect");
    });
    expect(screen.getByRole("status")).toHaveTextContent("Recovering missed rooms");
    expect(fetch).toHaveBeenCalledTimes(1);

    const concurrentRoom: PublicRoom = {
      id: "33333333-3333-4333-8333-333333333333",
      title: "Concurrent event room",
      latitude: 7,
      longitude: 8,
      createdAt: "2026-09-17T10:02:00.000Z"
    };
    act(() => emit("room.created", {
      room: concurrentRoom,
      clientRequestId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
    }));
    const missedRoom: PublicRoom = {
      id: "44444444-4444-4444-8444-444444444444",
      title: "Missed room",
      latitude: 9,
      longitude: 10,
      createdAt: "2026-09-17T10:03:00.000Z"
    };
    await act(async () => resolveFetch({
      ok: true,
      status: 200,
      json: async () => [firstRoom, eventRoom, missedRoom]
    } as Response));

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Live room updates recovered."));
    expect(client.getQueryData<PublicRoom[]>(roomsQueryKey)).toEqual([
      firstRoom,
      eventRoom,
      concurrentRoom,
      missedRoom
    ]);
  });
});
