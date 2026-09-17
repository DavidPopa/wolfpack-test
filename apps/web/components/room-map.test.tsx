import type { PublicRoom } from "@map-chat/contracts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentType, PropsWithChildren } from "react";
import type { AuthSession } from "@/lib/auth-client";
import type { AuthSessionState } from "@/lib/auth-session";
import { useAuthSession } from "@/lib/auth-session";
import { fetchPublicRooms } from "@/lib/rooms";
import { roomCreateAttemptsQueryKey, type RoomCreateAttempt } from "@/lib/room-create";
import { roomsQueryKey, upsertPublicRoom } from "@/lib/rooms";
import { RoomMap } from "./room-map";

type MockMapEvent = {
  latlng: { lat: number; lng: number };
  originalEvent?: Event;
};

type MockMarkerEvent = {
  originalEvent?: Event;
};

type MockMarker = {
  addTo: jest.Mock<MockMarker, [unknown]>;
  emit: (eventName: string, event: MockMarkerEvent) => void;
  getElement: jest.Mock<HTMLElement, []>;
  on: (eventName: string, handler: (event: MockMarkerEvent) => void) => MockMarker;
  removeFrom: jest.Mock<void, [unknown]>;
  setIcon: jest.Mock<void, [unknown]>;
  setLatLng: jest.Mock<void, [[number, number]]>;
  options: Record<string, unknown>;
};

type MockMapInstance = {
  getCenter: jest.Mock<{ lat: number; lng: number }, []>;
  getMaxZoom: jest.Mock<number, []>;
  getZoom: jest.Mock<number, []>;
  on: jest.Mock<MockMapInstance, [string, (event: MockMapEvent) => void]>;
  remove: jest.Mock<void, []>;
  setView: jest.Mock<MockMapInstance, [[number, number], number]>;
  wrapLatLng: jest.Mock<{ lat: number; lng: number }, [{ lat: number; lng: number }]>;
};

type MockTileLayer = {
  addTo: jest.Mock<MockTileLayer, [unknown]>;
  on: jest.Mock<MockTileLayer, [string, () => void]>;
};

const mockMapHandlers = new Map<string, Array<(event: MockMapEvent) => void>>();
const mockTileHandlers = new Map<string, Array<() => void>>();
const mockMarkerInstances: MockMarker[] = [];
const mockMapInstance: MockMapInstance = {
  getCenter: jest.fn(() => ({ lat: 46.77, lng: 23.59 })),
  getMaxZoom: jest.fn(() => 18),
  getZoom: jest.fn(() => 13),
  on: jest.fn((eventName: string, handler: (event: MockMapEvent) => void) => {
    mockMapHandlers.set(eventName, [...(mockMapHandlers.get(eventName) ?? []), handler]);
    return mockMapInstance;
  }),
  remove: jest.fn(),
  setView: jest.fn((_center: [number, number], _zoom: number) => mockMapInstance),
  wrapLatLng: jest.fn((latlng: { lat: number; lng: number }) => {
    const longitude = ((((latlng.lng + 180) % 360) + 360) % 360) - 180;
    return { lat: latlng.lat, lng: Object.is(longitude, -0) ? 0 : longitude };
  })
};

const mockTileLayer: MockTileLayer = {
  addTo: jest.fn((_map: unknown) => mockTileLayer),
  on: jest.fn((eventName: string, handler: () => void) => {
    mockTileHandlers.set(eventName, [...(mockTileHandlers.get(eventName) ?? []), handler]);
    return mockTileLayer;
  })
};

jest.mock("leaflet", () => ({
  __esModule: true,
  divIcon: jest.fn((options: unknown) => options),
  map: jest.fn(() => mockMapInstance),
  marker: jest.fn((coordinates: [number, number], options: Record<string, unknown>) => {
    const handlers = new Map<string, Array<(event: MockMarkerEvent) => void>>();
    const element = document.createElement("button");
    const marker: MockMarker = {
      addTo: jest.fn((_map: unknown) => marker),
      emit: (eventName, event) => {
        for (const handler of handlers.get(eventName) ?? []) handler(event);
      },
      getElement: jest.fn(() => element),
      on: (eventName: string, handler: (event: MockMarkerEvent) => void) => {
        handlers.set(eventName, [...(handlers.get(eventName) ?? []), handler]);
        return marker;
      },
      removeFrom: jest.fn(),
      setIcon: jest.fn(),
      setLatLng: jest.fn(),
      options: { ...options, coordinates }
    };
    mockMarkerInstances.push(marker);
    return marker;
  }),
  tileLayer: jest.fn(() => mockTileLayer)
}));

jest.mock("@/lib/auth-session", () => ({ useAuthSession: jest.fn() }));
jest.mock("@/lib/rooms", () => ({
  ...jest.requireActual("@/lib/rooms"),
  fetchPublicRooms: jest.fn()
}));
jest.mock("./auth-panel", () => ({ AuthPanel: () => <section aria-label="Account controls">Mock account controls</section> }));
const mockMessageHistoryPanel = jest.fn((_props: { roomId: string }) => <p role="status">No messages in this room yet.</p>);
jest.mock("./message-history-panel", () => ({
  MessageHistoryPanel: (props: { roomId: string }) => mockMessageHistoryPanel(props)
}));

const rooms = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    title: "Cluj makers",
    latitude: 46.77,
    longitude: 23.59,
    createdAt: "2026-02-01T00:00:00.000Z"
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    title: "Quiet library",
    latitude: 46.76,
    longitude: 23.58,
    createdAt: "2026-02-02T00:00:00.000Z"
  }
] satisfies PublicRoom[];

const firstRoom = rooms[0] as PublicRoom;
const secondRoom = rooms[1] as PublicRoom;

const signedInState = {
  status: "signed-in",
  session: {
    session: { id: "session-id", userId: "user-id" },
    user: { id: "user-id", name: "Avery Stone", email: "private@example.invalid" }
  } as AuthSession
} satisfies AuthSessionState;

const signedOutState = { status: "signed-out" } satisfies AuthSessionState;

const mockUseAuthSession = useAuthSession as jest.MockedFunction<typeof useAuthSession>;
const mockFetchPublicRooms = fetchPublicRooms as jest.MockedFunction<typeof fetchPublicRooms>;

function renderRoomMap() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { gcTime: Infinity, retry: false }
    }
  });
  const Wrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { ...render(<RoomMap />, { wrapper: Wrapper }), client };
}

function createResponse(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

function successfulRoomResponse(status: 200 | 201, id: string, title: string) {
  return async (_input: RequestInfo | URL, init?: RequestInit) => {
    const request = JSON.parse(String(init?.body)) as {
      latitude: number;
      longitude: number;
      clientRequestId: string;
    };
    return createResponse(status, {
      id,
      title,
      latitude: request.latitude,
      longitude: request.longitude,
      createdAt: "2026-09-17T10:05:00.000Z",
      clientRequestId: request.clientRequestId
    });
  };
}

function mapClick(latitude: number, longitude: number, target?: Element) {
  const event = new MouseEvent("click", { bubbles: true });
  if (target) Object.defineProperty(event, "target", { value: target });
  for (const handler of mockMapHandlers.get("click") ?? []) {
    handler({ latlng: { lat: latitude, lng: longitude }, originalEvent: event });
  }
}

function mapEvent(eventName: string) {
  for (const handler of mockMapHandlers.get(eventName) ?? []) {
    handler({ latlng: { lat: 0, lng: 0 } });
  }
}

function markerByTitle(title: string) {
  const marker = mockMarkerInstances.find((instance) => instance.options.title === title);
  if (!marker) throw new Error(`Missing marker ${title}`);
  return marker;
}

async function waitForRooms() {
  await screen.findByText("2 public rooms are visible on the map.");
  await waitFor(() => expect(mockMarkerInstances.filter((marker) => marker.options.title !== "Unsaved room location")).toHaveLength(2));
}

beforeEach(() => {
  mockMapHandlers.clear();
  mockTileHandlers.clear();
  mockMarkerInstances.splice(0, mockMarkerInstances.length);
  mockMapInstance.getCenter.mockReturnValue({ lat: 46.77, lng: 23.59 });
  mockMapInstance.getZoom.mockReturnValue(13);
  mockUseAuthSession.mockReturnValue(signedOutState);
  mockFetchPublicRooms.mockResolvedValue(rooms);
  mockMessageHistoryPanel.mockReset();
  mockMessageHistoryPanel.mockImplementation(() => <p role="status">No messages in this room yet.</p>);
  Object.defineProperty(globalThis, "fetch", {
    configurable: true,
    writable: true,
    value: jest.fn()
  });
  window.history.replaceState({}, "", "/");
  jest.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    callback(0);
    return 1;
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("room map selection and draft state", () => {
  it("selects a persisted marker by mouse or keyboard without creating a draft", async () => {
    renderRoomMap();
    await waitForRooms();

    const firstMarker = markerByTitle("Cluj makers");
    act(() => firstMarker.emit("click", { originalEvent: new MouseEvent("click", { detail: 1 }) }));
    expect(screen.getByRole("heading", { name: "Cluj makers" })).toBeVisible();
    expect(screen.getByText("Selected persisted room")).toBeVisible();
    expect(await screen.findByText("No messages in this room yet.")).toBeVisible();
    expect(new URL(window.location.href).searchParams.get("room")).toBe(firstRoom.id);
    expect(new URL(window.location.href).searchParams.get("draft")).toBeNull();
    expect(mockMarkerInstances.some((marker) => marker.options.title === "Unsaved room location")).toBe(false);

    const keyboardEvent = new KeyboardEvent("keydown", { bubbles: true });
    const stopPropagation = jest.spyOn(keyboardEvent, "stopPropagation");
    const secondMarker = markerByTitle("Quiet library");
    act(() => secondMarker.emit("click", { originalEvent: keyboardEvent }));
    expect(stopPropagation).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("heading", { name: "Quiet library" })).toHaveFocus();
    expect(new URL(window.location.href).searchParams.get("room")).toBe(secondRoom.id);
    expect(new URL(window.location.href).searchParams.get("draft")).toBeNull();
  });

  it("keeps a late initial retry isolated after selecting another room", async () => {
    const { MessageHistoryPanel } = jest.requireActual("./message-history-panel") as {
      MessageHistoryPanel: ComponentType<{ roomId: string }>;
    };
    mockMessageHistoryPanel.mockImplementation((props) => <MessageHistoryPanel {...props} />);
    let resolveRoomARetry!: (response: Response) => void;
    jest.mocked(fetch)
      .mockResolvedValueOnce(createResponse(503, { error: { code: "UNAVAILABLE" } }))
      .mockReturnValueOnce(new Promise((resolve) => { resolveRoomARetry = resolve; }))
      .mockResolvedValueOnce(createResponse(200, {
        messages: [{
          id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          roomId: secondRoom.id,
          body: "Room B current history",
          createdAt: "2026-09-17T11:00:00.000Z",
          author: { name: "Blair", image: null }
        }],
        pageInfo: { startCursor: "room_b_start", endCursor: "room_b_end", hasOlder: false, hasNewer: false }
      }));
    renderRoomMap();
    await waitForRooms();
    const user = userEvent.setup();

    act(() => markerByTitle("Cluj makers").emit("click", {
      originalEvent: new MouseEvent("click", { detail: 1 })
    }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Messages could not be loaded");
    await user.click(screen.getByRole("button", { name: "Retry loading messages" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));

    act(() => markerByTitle("Quiet library").emit("click", {
      originalEvent: new MouseEvent("click", { detail: 1 })
    }));
    expect(await screen.findByText("Room B current history")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Quiet library" })).toBeVisible();
    expect(new URL(window.location.href).searchParams.get("room")).toBe(secondRoom.id);

    await act(async () => resolveRoomARetry(createResponse(200, {
      messages: [{
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        roomId: firstRoom.id,
        body: "Late room A retry history",
        createdAt: "2026-09-17T10:00:00.000Z",
        author: { name: "Avery", image: null }
      }],
      pageInfo: { startCursor: "room_a_start", endCursor: "room_a_end", hasOlder: false, hasNewer: false }
    })));

    await waitFor(() => expect(screen.queryByText("Late room A retry history")).not.toBeInTheDocument());
    expect(screen.getByText("Room B current history")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Quiet library" })).toBeVisible();
    expect(new URL(window.location.href).searchParams.get("room")).toBe(secondRoom.id);
  });

  it("creates and replaces one local draft only from empty map clicks", async () => {
    renderRoomMap();
    await waitForRooms();

    act(() => mapClick(-0, -0));
    expect(screen.getByRole("heading", { name: "Unsaved room location" })).toBeVisible();
    expect(screen.getByText("Local unsaved draft")).toBeVisible();
    expect(new URL(window.location.href).searchParams.get("draft")).toBe("0,0");
    expect(mockMarkerInstances.filter((marker) => marker.options.title === "Unsaved room location")).toHaveLength(1);

    act(() => mapClick(4.25, -7.75));
    expect(screen.getByText("4.25, -7.75")).toBeVisible();
    expect(new URL(window.location.href).searchParams.get("draft")).toBe("4.25,-7.75");
    expect(mockMarkerInstances.filter((marker) => marker.options.title === "Unsaved room location")).toHaveLength(2);
    expect(mockMarkerInstances.filter((marker) => marker.options.title === "Unsaved room location").at(0)?.removeFrom).toHaveBeenCalledTimes(1);

    act(() => mapClick(43.5, 378.875));
    expect(screen.getByText("43.5, 18.875")).toBeVisible();
    expect(new URL(window.location.href).searchParams.get("draft")).toBe("43.5,18.875");

    act(() => mapClick(43.5, -541.125));
    expect(screen.getByText("43.5, 178.875")).toBeVisible();
    expect(new URL(window.location.href).searchParams.get("draft")).toBe("43.5,178.875");

    const control = document.createElement("button");
    control.className = "leaflet-control";
    act(() => mapClick(8, 9, control));
    expect(new URL(window.location.href).searchParams.get("draft")).toBe("43.5,178.875");

    const roomIcon = document.createElement("button");
    roomIcon.className = "leaflet-marker-icon";
    act(() => mapClick(8, 9, roomIcon));
    expect(new URL(window.location.href).searchParams.get("draft")).toBe("43.5,178.875");

    act(() => {
      mapEvent("dragstart");
      mapEvent("dragend");
      mapClick(8, 9);
    });
    expect(new URL(window.location.href).searchParams.get("draft")).toBe("43.5,178.875");
  });

  it("restores valid URL state and discards malformed or unknown state", async () => {
    window.history.replaceState({}, "", `/?draft=46.7701,23.5901&filter=open`);
    const view = renderRoomMap();
    await waitForRooms();
    expect(screen.getByRole("heading", { name: "Unsaved room location" })).toBeVisible();
    expect(screen.getByText("46.7701, 23.5901")).toBeVisible();
    expect(new URL(window.location.href).searchParams.get("filter")).toBe("open");

    window.history.pushState({}, "", `/?room=${firstRoom.id}&draft=46,23&filter=open`);
    act(() => window.dispatchEvent(new PopStateEvent("popstate")));
    expect(screen.getByRole("heading", { name: "Choose a room" })).toBeVisible();
    expect(window.location.search).toBe("?filter=open");

    window.history.pushState({}, "", `/?room=${secondRoom.id}&filter=open`);
    act(() => window.dispatchEvent(new PopStateEvent("popstate")));
    expect(screen.getByRole("heading", { name: "Quiet library" })).toBeVisible();

    window.history.pushState({}, "", "/?room=33333333-3333-4333-8333-333333333333&draft=javascript:alert(1),23");
    act(() => window.dispatchEvent(new PopStateEvent("popstate")));
    expect(screen.getByRole("heading", { name: "Choose a room" })).toBeVisible();
    expect(window.location.search).toBe("");
    view.unmount();
  });

  it("keeps guest restoration write-free and requires explicit signed-in creation", async () => {
    window.history.replaceState({}, "", "/?draft=12.5,23.75");
    const guestView = renderRoomMap();
    await waitForRooms();

    expect(screen.getByText("Sign in with Google to keep this location and then choose whether to create the room.")).toBeVisible();
    expect(fetch).not.toHaveBeenCalled();
    guestView.unmount();

    mockUseAuthSession.mockReturnValue(signedInState);
    jest.mocked(fetch).mockImplementationOnce(async (_input, init) => {
      const request = JSON.parse(String(init?.body)) as { clientRequestId: string };
      return {
        status: 201,
        json: async () => ({
          id: "33333333-3333-4333-8333-333333333333",
          title: "Room at 12.5000, 23.7500",
          latitude: 12.5,
          longitude: 23.75,
          createdAt: "2026-09-17T10:00:00.000Z",
          clientRequestId: request.clientRequestId
        })
      } as Response;
    });
    renderRoomMap();
    await screen.findByText("Your draft was restored. Creating the room still requires an explicit action.");

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Create room here" }));
    expect(await screen.findByRole("heading", { name: "Room at 12.5000, 23.7500" })).toBeVisible();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each([200, 201] as const)("reconciles an explicit signed-in %i response to one canonical room", async (status) => {
    mockUseAuthSession.mockReturnValue(signedInState);
    window.history.replaceState({}, "", "/?draft=10,20");
    jest.mocked(fetch).mockImplementationOnce(successfulRoomResponse(
      status,
      "55555555-5555-4555-8555-555555555555",
      `Canonical ${status}`
    ));
    const { client } = renderRoomMap();
    await waitForRooms();

    await userEvent.setup().click(screen.getByRole("button", { name: "Create room here" }));
    expect(await screen.findByRole("heading", { name: `Canonical ${status}` })).toBeVisible();
    expect(client.getQueryData<PublicRoom[]>(roomsQueryKey)?.filter(
      (room) => room.id === "55555555-5555-4555-8555-555555555555"
    )).toHaveLength(1);
    expect(client.getQueryData<RoomCreateAttempt[]>(roomCreateAttemptsQueryKey)).toEqual([]);
  });

  it.each([
    [400, { error: { code: "INVALID_ROOM_REQUEST", message: "Invalid room request" } }, "This location could not be submitted", "Start a new attempt here"],
    [401, { error: { code: "UNAUTHORIZED", message: "Authentication required" } }, "Please sign in again", "Retry creating room"],
    [409, { error: { code: "ROOM_REQUEST_CONFLICT", message: "Request ID already used with different coordinates" } }, "retry token was already used", "Start a new attempt here"],
    [429, { error: { code: "ROOM_RATE_LIMITED", message: "Room creation rate limit exceeded", retryAfterSeconds: 11 } }, "Try again in 11 seconds", "Retry creating room"],
    [503, { error: { code: "ROOM_RATE_LIMIT_UNAVAILABLE", message: "Room creation is temporarily unavailable", retryable: true } }, "temporarily unavailable", "Retry creating room"]
  ])("retains targeted attempt UI for HTTP %i", async (status, body, message, action) => {
    mockUseAuthSession.mockReturnValue(signedInState);
    window.history.replaceState({}, "", "/?draft=10,20");
    jest.mocked(fetch).mockResolvedValueOnce(createResponse(status as number, body));
    const { client } = renderRoomMap();
    await waitForRooms();

    await userEvent.setup().click(screen.getByRole("button", { name: "Create room here" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(String(message));
    expect(screen.getByRole("button", { name: String(action) })).toBeVisible();
    expect(client.getQueryData<RoomCreateAttempt[]>(roomCreateAttemptsQueryKey)).toEqual([
      expect.objectContaining({ status: "failed", coordinates: { latitude: 10, longitude: 20 } })
    ]);
  });

  it("reuses one request ID for a retryable network failure", async () => {
    mockUseAuthSession.mockReturnValue(signedInState);
    window.history.replaceState({}, "", "/?draft=10,20");
    jest.mocked(fetch)
      .mockRejectedValueOnce(new TypeError("offline"))
      .mockImplementationOnce(successfulRoomResponse(
        200,
        "66666666-6666-4666-8666-666666666666",
        "Recovered room"
      ));
    renderRoomMap();
    await waitForRooms();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Create room here" }));
    await user.click(await screen.findByRole("button", { name: "Retry creating room" }));
    expect(await screen.findByRole("heading", { name: "Recovered room" })).toBeVisible();
    const requestIds = jest.mocked(fetch).mock.calls.map(([, init]) =>
      (JSON.parse(String(init?.body)) as { clientRequestId: string }).clientRequestId
    );
    expect(requestIds).toHaveLength(2);
    expect(requestIds[1]).toBe(requestIds[0]);
  });

  it("targets rollback and late success without dropping a second attempt, concurrent room, or newer selection", async () => {
    mockUseAuthSession.mockReturnValue(signedInState);
    window.history.replaceState({}, "", "/?draft=10,20");
    let rejectFirst!: (reason: unknown) => void;
    let resolveSecond!: (response: Response) => void;
    jest.mocked(fetch)
      .mockReturnValueOnce(new Promise((_resolve, reject) => { rejectFirst = reject; }))
      .mockReturnValueOnce(new Promise((resolve) => { resolveSecond = resolve; }));
    const { client } = renderRoomMap();
    await waitForRooms();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Create room here" }));
    act(() => mapClick(30, 40));
    await user.click(screen.getByRole("button", { name: "Create room here" }));
    await act(async () => rejectFirst(new TypeError("first offline")));
    await waitFor(() => expect(client.getQueryData<RoomCreateAttempt[]>(roomCreateAttemptsQueryKey))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ status: "failed", coordinates: { latitude: 10, longitude: 20 } }),
        expect.objectContaining({ status: "pending", coordinates: { latitude: 30, longitude: 40 } })
      ])));

    const concurrentRoom: PublicRoom = {
      id: "77777777-7777-4777-8777-777777777777",
      title: "Concurrent refresh room",
      latitude: 50,
      longitude: 60,
      createdAt: "2026-09-17T10:04:00.000Z"
    };
    act(() => {
      client.setQueryData(roomsQueryKey, (existing: PublicRoom[] | undefined) =>
        upsertPublicRoom(existing, concurrentRoom)
      );
      markerByTitle("Cluj makers").emit("click", {
        originalEvent: new MouseEvent("click", { detail: 1 })
      });
    });
    const secondRequest = JSON.parse(String(jest.mocked(fetch).mock.calls[1]?.[1]?.body)) as {
      clientRequestId: string;
    };
    await act(async () => resolveSecond(createResponse(201, {
      id: "88888888-8888-4888-8888-888888888888",
      title: "Late room",
      latitude: 30,
      longitude: 40,
      createdAt: "2026-09-17T10:06:00.000Z",
      clientRequestId: secondRequest.clientRequestId
    })));

    await waitFor(() => expect(client.getQueryData<PublicRoom[]>(roomsQueryKey)?.map((room) => room.id))
      .toEqual(expect.arrayContaining([concurrentRoom.id, "88888888-8888-4888-8888-888888888888"])));
    expect(screen.getByRole("heading", { name: "Cluj makers" })).toBeVisible();
    expect(client.getQueryData<RoomCreateAttempt[]>(roomCreateAttemptsQueryKey)).toEqual([
      expect.objectContaining({ status: "failed", coordinates: { latitude: 10, longitude: 20 } })
    ]);
  });

  it("keeps room and tile failures observable without blocking map controls", async () => {
    mockFetchPublicRooms.mockRejectedValue(new Error("unavailable"));
    renderRoomMap();
    expect(await screen.findByRole("alert")).toHaveTextContent("Rooms could not be loaded.");

    act(() => {
      for (const handler of mockTileHandlers.get("tileerror") ?? []) handler();
    });
    expect(screen.getByText("Map tiles are currently unavailable. Room status is still shown below.")).toBeVisible();
  });
});
