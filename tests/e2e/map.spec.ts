import { expect, test, type Page } from "@playwright/test";
import { interceptStadiaTiles } from "./map-network";

const rooms = [
  { id: "11111111-1111-4111-8111-111111111111", title: "Cluj makers", latitude: 46.7712, longitude: 23.6236, createdAt: "2026-09-16T10:00:00.000Z" },
  { id: "22222222-2222-4222-8222-222222222222", title: "Bucharest readers", latitude: 44.4268, longitude: 26.1025, createdAt: "2026-09-16T11:00:00.000Z" }
];

const signedInSession = {
  session: {
    id: "session-id",
    userId: "user-id",
    expiresAt: "2026-09-17T12:00:00.000Z",
    token: "test-session-token",
    createdAt: "2026-09-16T12:00:00.000Z",
    updatedAt: "2026-09-16T12:00:00.000Z"
  },
  user: {
    id: "user-id",
    name: "Avery Stone",
    email: "avery@example.invalid",
    emailVerified: true,
    image: null,
    createdAt: "2026-09-16T12:00:00.000Z",
    updatedAt: "2026-09-16T12:00:00.000Z"
  }
};

async function interceptMapBoundaries(page: Page, roomPayload = rooms) {
  const tileRequests = await interceptStadiaTiles(page);
  const roomMethods: string[] = [];
  const roomCreateRequests: Array<{ latitude: number; longitude: number; clientRequestId: string }> = [];
  let sessionBody = "null";
  await page.route("**/api/auth/get-session", (route) => route.fulfill({ status: 200, contentType: "application/json", body: sessionBody }));
  await page.route("**/api/rooms", (route) => {
    const request = route.request();
    roomMethods.push(request.method());
    if (request.method() === "POST") {
      const body = request.postDataJSON() as { latitude: number; longitude: number; clientRequestId: string };
      roomCreateRequests.push(body);
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          id: "33333333-3333-4333-8333-333333333333",
          title: "Room at 46.7701, 23.5901",
          latitude: body.latitude,
          longitude: body.longitude,
          createdAt: "2026-09-17T10:00:00.000Z",
          clientRequestId: body.clientRequestId
        })
      });
    }
    if (request.method() !== "GET") {
      return route.fulfill({ status: 405, contentType: "application/json", body: JSON.stringify({ error: "unexpected method" }) });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(roomPayload) });
  });
  return {
    roomCreateRequests,
    roomMethods,
    tileRequests,
    signIn: () => {
      sessionBody = JSON.stringify(signedInSession);
    }
  };
}

function wrapLongitude(longitude: number) {
  const wrapped = ((((longitude + 180) % 360) + 360) % 360) - 180;
  return Object.is(wrapped, -0) ? 0 : wrapped;
}

function parseCoordinatePair(value: string | null) {
  if (!value) throw new Error("Expected coordinate pair");
  const [latitude, longitude] = value.split(",").map(Number);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) throw new Error(`Invalid coordinate pair ${value}`);
  return { latitude, longitude };
}

async function mapCenter(page: Page) {
  return parseCoordinatePair(await page.getByRole("region", { name: "Public room map" }).getAttribute("data-map-center"));
}

async function panMapPastLongitude(page: Page, direction: "east" | "west") {
  const map = page.getByRole("region", { name: "Public room map" });
  const box = await map.boundingBox();
  expect(box).not.toBeNull();
  const targetX = direction === "east" ? box!.x + 20 : box!.x + box!.width - 20;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.down();
    await page.mouse.move(targetX, box!.y + box!.height / 2, { steps: 8 });
    await page.mouse.up();
    const center = await mapCenter(page);
    if (direction === "east" && center.longitude > 180) return center;
    if (direction === "west" && center.longitude < -180) return center;
  }
  throw new Error(`Map did not pan past ${direction === "east" ? "+180" : "-180"} longitude`);
}

async function clickMapCenter(page: Page) {
  const map = page.getByRole("region", { name: "Public room map" });
  const box = await map.boundingBox();
  expect(box).not.toBeNull();
  await page.waitForTimeout(20);
  await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
  return parseCoordinatePair(new URL(page.url()).searchParams.get("draft"));
}

test("real production Leaflet renders persisted pins and exact attribution at desktop size", async ({ page }) => {
  const { roomMethods, tileRequests } = await interceptMapBoundaries(page);
  await page.goto("/");

  const map = page.getByRole("region", { name: "Public room map" });
  await expect(map).toHaveClass(/leaflet-container/);
  await expect(map).toHaveAttribute("data-map-center", "46.7712,23.6236");
  await expect(map).toHaveAttribute("data-map-zoom", "5");
  await expect(map).toHaveAttribute("data-map-max-zoom", "16");
  await expect(page.locator(".leaflet-marker-icon.room-pin-wrapper")).toHaveCount(2);
  await expect(page.getByRole("group", { name: "Room loading status" }).getByRole("status"))
    .toContainText("2 public rooms are visible");
  await expect(page.getByRole("link", { name: "Stadia Maps" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Stamen Design" })).toBeVisible();
  await expect(page.getByRole("link", { name: "OpenStreetMap" })).toBeVisible();
  await expect.poll(() => tileRequests.some((url) => url.includes("/stamen_watercolor/5/"))).toBe(true);

  const zoomIn = page.locator(".leaflet-control-zoom-in");
  for (let expectedZoom = 6; expectedZoom <= 16; expectedZoom += 1) {
    await zoomIn.click();
    await expect(map).toHaveAttribute("data-map-zoom", String(expectedZoom));
  }
  await expect(map).toHaveAttribute("data-map-zoom", "16");
  await expect(zoomIn).toHaveAttribute("aria-disabled", "true");
  expect(roomMethods).toEqual(["GET"]);
});

test("persisted marker selection, controls, drag, and browser history stay mutually exclusive with drafts", async ({ page }) => {
  const { roomMethods } = await interceptMapBoundaries(page);
  await page.goto("/");

  const map = page.getByRole("region", { name: "Public room map" });
  const rail = page.getByLabel("Room details and account controls");
  const mapBox = await map.boundingBox();
  const railBox = await rail.boundingBox();
  expect(mapBox).not.toBeNull();
  expect(railBox).not.toBeNull();
  expect(mapBox!.x + mapBox!.width).toBeLessThanOrEqual(railBox!.x + 4);

  const firstMarker = page.locator(".leaflet-marker-icon.room-pin-wrapper[title='Cluj makers']");
  await firstMarker.click();
  await expect(page.getByRole("heading", { name: "Cluj makers" })).toBeVisible();
  await expect(page.getByText("Selected persisted room")).toBeVisible();
  await expect(page.getByText("No messages are available in this room shell yet.")).toBeVisible();
  await expect(page.locator(".room-pin-wrapper--selected .room-pin__selected")).toHaveText("✓");
  await expect(page).toHaveURL(new RegExp(`room=${rooms[0].id}`));
  await expect(page.locator(".leaflet-marker-icon.draft-pin-wrapper")).toHaveCount(0);

  await page.locator(".leaflet-control-zoom-in").click();
  await page.locator(".leaflet-control-attribution").dispatchEvent("click", { bubbles: true });
  const dragStart = await map.boundingBox();
  expect(dragStart).not.toBeNull();
  await page.mouse.move(dragStart!.x + dragStart!.width / 2, dragStart!.y + dragStart!.height / 2);
  await page.mouse.down();
  await page.mouse.move(dragStart!.x + dragStart!.width / 2 + 90, dragStart!.y + dragStart!.height / 2 + 40, { steps: 6 });
  await page.mouse.up();
  await expect(page).toHaveURL(new RegExp(`room=${rooms[0].id}`));
  await expect(page.locator(".leaflet-marker-icon.draft-pin-wrapper")).toHaveCount(0);

  const emptyPoint = await map.boundingBox();
  expect(emptyPoint).not.toBeNull();
  await page.mouse.click(emptyPoint!.x + emptyPoint!.width * 0.78, emptyPoint!.y + emptyPoint!.height * 0.76);
  await expect(page.getByRole("heading", { name: "Unsaved room location" })).toBeVisible();
  await expect(page.getByText("Local unsaved draft")).toBeVisible();
  await expect(page).toHaveURL(/draft=/);
  await expect(page.locator(".leaflet-marker-icon.draft-pin-wrapper")).toHaveCount(1);

  await page.mouse.click(emptyPoint!.x + emptyPoint!.width * 0.68, emptyPoint!.y + emptyPoint!.height * 0.66);
  await expect(page.locator(".leaflet-marker-icon.draft-pin-wrapper")).toHaveCount(1);
  await page.goBack();
  await expect(page.getByRole("heading", { name: "Unsaved room location" })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("heading", { name: "Cluj makers" })).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`room=${rooms[0].id}`));
  await page.goForward();
  await expect(page.getByRole("heading", { name: "Unsaved room location" })).toBeVisible();
  expect(roomMethods.filter((method) => method === "POST")).toHaveLength(0);
});

test("empty-map drafts wrap panned longitudes before URL validation", async ({ page }) => {
  await interceptMapBoundaries(page, rooms.slice(0, 1));
  await page.goto("/");
  await expect(page.locator(".leaflet-marker-icon.room-pin-wrapper")).toHaveCount(1);

  const eastCenter = await panMapPastLongitude(page, "east");
  const eastDraft = await clickMapCenter(page);
  expect(eastDraft.latitude).toBeGreaterThanOrEqual(-90);
  expect(eastDraft.latitude).toBeLessThanOrEqual(90);
  expect(eastDraft.longitude).toBeGreaterThanOrEqual(-180);
  expect(eastDraft.longitude).toBeLessThanOrEqual(180);
  expect(eastDraft.longitude).toBeCloseTo(wrapLongitude(eastDraft.longitude + 360), 8);
  const eastEquivalent = eastDraft.longitude < 0 ? eastDraft.longitude + 360 : eastDraft.longitude;
  expect(eastEquivalent).toBeGreaterThan(180);
  expect(Math.abs(eastEquivalent - eastCenter.longitude)).toBeLessThan(90);

  await page.goto("/");
  await expect(page.locator(".leaflet-marker-icon.room-pin-wrapper")).toHaveCount(1);
  const westCenter = await panMapPastLongitude(page, "west");
  const westDraft = await clickMapCenter(page);
  expect(westDraft.latitude).toBeGreaterThanOrEqual(-90);
  expect(westDraft.latitude).toBeLessThanOrEqual(90);
  expect(westDraft.longitude).toBeGreaterThanOrEqual(-180);
  expect(westDraft.longitude).toBeLessThanOrEqual(180);
  expect(westDraft.longitude).toBeCloseTo(wrapLongitude(westDraft.longitude - 360), 8);
  const westEquivalent = westDraft.longitude > 0 ? westDraft.longitude - 360 : westDraft.longitude;
  expect(westEquivalent).toBeLessThan(-180);
  expect(Math.abs(westEquivalent - westCenter.longitude)).toBeLessThan(90);
});

test("valid draft state survives refresh and auth return, while invalid state is cleaned", async ({ page }) => {
  const boundaries = await interceptMapBoundaries(page);
  await page.goto("/?draft=46.7701,23.5901&filter=open");

  await expect(page.getByRole("heading", { name: "Unsaved room location" })).toBeVisible();
  await expect(page.getByText("46.7701, 23.5901")).toBeVisible();
  await expect(page.getByText("Sign in with Google to keep this location and then choose whether to create the room.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();

  await page.reload();
  await expect(page.getByText("46.7701, 23.5901")).toBeVisible();
  boundaries.signIn();
  await page.reload();
  await expect(page.getByText("Your draft was restored. Creating the room still requires an explicit action.")).toBeVisible();
  const roomCallsBeforeCreate = boundaries.roomMethods.length;
  await page.getByRole("button", { name: "Create room here" }).click();
  await expect(page.getByRole("heading", { name: "Room at 46.7701, 23.5901" })).toBeVisible();
  await expect(page).toHaveURL(/room=33333333-3333-4333-8333-333333333333/);
  expect(boundaries.roomMethods).toHaveLength(roomCallsBeforeCreate + 1);
  expect(boundaries.roomMethods.filter((method) => method === "POST")).toHaveLength(1);
  expect(boundaries.roomCreateRequests).toEqual([{
    latitude: 46.7701,
    longitude: 23.5901,
    clientRequestId: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  }]);

  await page.goto(`/?room=${rooms[0].id}&draft=javascript:alert(1),23&filter=open`);
  await expect(page.getByRole("heading", { name: "Choose a room" })).toBeVisible();
  await expect(page).toHaveURL(/\/\?filter=open$/);

  await page.goto("/?draft=91,23&filter=open");
  await expect(page.getByRole("heading", { name: "Choose a room" })).toBeVisible();
  await expect(page).toHaveURL(/\/\?filter=open$/);

  await page.goto("/?room=33333333-3333-4333-8333-333333333333");
  await expect(page.getByRole("heading", { name: "Choose a room" })).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
});

test("keyboard marker selection and draft panels reflow accessibly at mobile size", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { roomMethods } = await interceptMapBoundaries(page, rooms.slice(0, 1));
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Explore rooms around you." })).toBeVisible();
  const map = page.getByRole("region", { name: "Public room map" });
  await expect(map).toHaveClass(/leaflet-container/);
  await expect(page.locator(".leaflet-marker-icon.room-pin-wrapper")).toHaveCount(1);

  const marker = page.locator(".leaflet-marker-icon.room-pin-wrapper[title='Cluj makers']");
  await marker.focus();
  await marker.press("Enter");
  await expect(page.getByRole("heading", { name: "Cluj makers" })).toBeFocused();
  await expect(page).toHaveURL(new RegExp(`room=${rooms[0].id}`));
  await expect(page.locator(".leaflet-marker-icon.draft-pin-wrapper")).toHaveCount(0);

  const mapBox = await map.boundingBox();
  const railBox = await page.getByLabel("Room details and account controls").boundingBox();
  expect(mapBox).not.toBeNull();
  expect(railBox).not.toBeNull();
  expect(mapBox!.y + mapBox!.height).toBeLessThanOrEqual(railBox!.y + 4);

  const signIn = page.getByRole("button", { name: "Continue with Google" });
  await signIn.scrollIntoViewIfNeeded();
  await expect(signIn).toBeVisible();
  await expect(signIn).toBeInViewport();
  expect(roomMethods.filter((method) => method === "POST")).toHaveLength(0);
});
