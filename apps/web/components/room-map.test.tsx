import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { MAP_CENTER, MAP_INITIAL_ZOOM, MAP_MAX_ZOOM, STADIA_WATERCOLOR } from "@/lib/map-provider";
import { RoomMap } from "./room-map";

jest.mock("leaflet", () => {
  const mapInstance = {
    getCenter: jest.fn(() => ({ lat: 46.7712, lng: 23.6236 })),
    getMaxZoom: jest.fn(() => 16),
    getZoom: jest.fn(() => 5),
    on: jest.fn(),
    remove: jest.fn(),
    setView: jest.fn()
  };
  mapInstance.setView.mockReturnValue(mapInstance);

  const tileLayerInstance = { addTo: jest.fn(), on: jest.fn() };
  tileLayerInstance.addTo.mockReturnValue(tileLayerInstance);
  tileLayerInstance.on.mockReturnValue(tileLayerInstance);

  return {
    __esModule: true,
    __mock: { mapInstance, tileLayerInstance },
    divIcon: jest.fn((options: unknown) => options),
    map: jest.fn(() => mapInstance),
    marker: jest.fn(() => ({ addTo: jest.fn(), removeFrom: jest.fn() })),
    tileLayer: jest.fn(() => tileLayerInstance)
  };
});

type LeafletMock = {
  __mock: {
    mapInstance: { setView: jest.Mock };
    tileLayerInstance: { on: jest.Mock };
  };
  divIcon: jest.Mock;
  map: jest.Mock;
  marker: jest.Mock;
  tileLayer: jest.Mock;
};

function leafletMock() {
  return jest.requireMock<LeafletMock>("leaflet");
}

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function TestProvider({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

function response(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as Response;
}

const rooms = [
  { id: "11111111-1111-4111-8111-111111111111", title: "Cluj makers", latitude: 46.7712, longitude: 23.6236, createdAt: "2026-09-16T10:00:00.000Z" },
  { id: "22222222-2222-4222-8222-222222222222", title: "Bucharest readers", latitude: 44.4268, longitude: 26.1025, createdAt: "2026-09-16T11:00:00.000Z" }
];

beforeEach(() => {
  jest.clearAllMocks();
  Object.defineProperty(globalThis, "fetch", { configurable: true, writable: true, value: jest.fn() });
});

afterEach(() => jest.restoreAllMocks());

describe("RoomMap with an explicit Leaflet module mock", () => {
  it("loads validated rooms and creates one stable, read-only custom marker for each", async () => {
    let resolveFetch: ((value: Response) => void) | undefined;
    jest.mocked(globalThis.fetch).mockReturnValue(new Promise((resolve) => { resolveFetch = resolve; }));
    render(<RoomMap />, { wrapper: wrapper() });

    expect(screen.getByRole("status")).toHaveTextContent("Loading public rooms");
    expect(screen.getByRole("region", { name: "Public room map" })).toHaveAttribute("aria-label", "Public room map");
    resolveFetch?.(response(rooms));

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("2 public rooms are visible"));
    await waitFor(() => expect(leafletMock().marker).toHaveBeenCalledTimes(2));
    expect(globalThis.fetch).toHaveBeenCalledWith("/api/rooms", { headers: { accept: "application/json" } });
    expect(leafletMock().map).toHaveBeenCalledWith(expect.any(HTMLDivElement), { maxZoom: MAP_MAX_ZOOM });
    expect(leafletMock().__mock.mapInstance.setView).toHaveBeenCalledWith(MAP_CENTER, MAP_INITIAL_ZOOM);
    expect(leafletMock().tileLayer).toHaveBeenCalledWith(STADIA_WATERCOLOR.tileUrl, STADIA_WATERCOLOR.options);
    expect(leafletMock().divIcon).toHaveBeenCalledWith(expect.objectContaining({ className: "room-pin-wrapper" }));
    expect(leafletMock().marker).toHaveBeenNthCalledWith(1, [46.7712, 23.6236], expect.objectContaining({ draggable: false, title: "Cluj makers" }));
    expect(leafletMock().marker).toHaveBeenNthCalledWith(2, [44.4268, 26.1025], expect.objectContaining({ draggable: false, title: "Bucharest readers" }));
  });

  it("announces an empty validated room list", async () => {
    jest.mocked(globalThis.fetch).mockResolvedValue(response([]));
    render(<RoomMap />, { wrapper: wrapper() });
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("No public rooms yet"));
    expect(leafletMock().marker).not.toHaveBeenCalled();
  });

  it("keeps failures generic and retries from the labelled control", async () => {
    const fetchMock = jest.mocked(globalThis.fetch)
      .mockResolvedValueOnce(response({ internal: "database details" }, false))
      .mockResolvedValueOnce(response(rooms.slice(0, 1)));
    const user = userEvent.setup();
    render(<RoomMap />, { wrapper: wrapper() });

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Rooms could not be loaded");
    expect(alert).not.toHaveTextContent("database details");
    const retry = screen.getByRole("button", { name: "Retry loading public rooms" });
    retry.focus();
    await user.keyboard("{Enter}");

    expect(await screen.findByRole("status")).toHaveTextContent("1 public room is visible");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects an invalid successful payload at the shared schema boundary", async () => {
    jest.mocked(globalThis.fetch).mockResolvedValue(response([{ ...rooms[0], latitude: 200 }]));
    render(<RoomMap />, { wrapper: wrapper() });
    expect(await screen.findByRole("alert")).toHaveTextContent("Rooms could not be loaded");
    expect(leafletMock().marker).not.toHaveBeenCalled();
  });

  it("announces a tile failure without substituting another provider", async () => {
    jest.mocked(globalThis.fetch).mockResolvedValue(response([]));
    render(<RoomMap />, { wrapper: wrapper() });
    await waitFor(() => expect(leafletMock().__mock.tileLayerInstance.on).toHaveBeenCalledWith("tileerror", expect.any(Function)));
    const tileErrorHandler = leafletMock().__mock.tileLayerInstance.on.mock.calls.find(([event]) => event === "tileerror")?.[1] as (() => void) | undefined;
    expect(tileErrorHandler).toBeDefined();
    act(() => tileErrorHandler?.());
    expect(screen.getByRole("alert")).toHaveTextContent("Map tiles are currently unavailable");
    expect(leafletMock().tileLayer).toHaveBeenCalledTimes(1);
    expect(leafletMock().tileLayer).toHaveBeenCalledWith(STADIA_WATERCOLOR.tileUrl, STADIA_WATERCOLOR.options);
  });
});
