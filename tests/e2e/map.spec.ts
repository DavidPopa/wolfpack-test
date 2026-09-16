import { expect, test, type Page } from "@playwright/test";
import { interceptStadiaTiles } from "./map-network";

const rooms = [
  { id: "11111111-1111-4111-8111-111111111111", title: "Cluj makers", latitude: 46.7712, longitude: 23.6236, createdAt: "2026-09-16T10:00:00.000Z" },
  { id: "22222222-2222-4222-8222-222222222222", title: "Bucharest readers", latitude: 44.4268, longitude: 26.1025, createdAt: "2026-09-16T11:00:00.000Z" }
];

async function interceptMapBoundaries(page: Page, roomPayload = rooms) {
  const tileRequests = await interceptStadiaTiles(page);
  await page.route("**/api/auth/get-session", (route) => route.fulfill({ status: 200, contentType: "application/json", body: "null" }));
  await page.route("**/api/rooms", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(roomPayload) }));
  return tileRequests;
}

test("real production Leaflet renders persisted pins and exact attribution at desktop size", async ({ page }) => {
  const tileRequests = await interceptMapBoundaries(page);
  await page.goto("/");

  const map = page.getByRole("region", { name: "Public room map" });
  await expect(map).toHaveClass(/leaflet-container/);
  await expect(map).toHaveAttribute("data-map-center", "46.7712,23.6236");
  await expect(map).toHaveAttribute("data-map-zoom", "5");
  await expect(map).toHaveAttribute("data-map-max-zoom", "16");
  await expect(page.locator(".leaflet-marker-icon.room-pin-wrapper")).toHaveCount(2);
  await expect(page.getByRole("status")).toContainText("2 public rooms are visible");
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
});

test("real production Leaflet and the auth control remain usable at mobile size", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await interceptMapBoundaries(page, rooms.slice(0, 1));
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Explore rooms around you." })).toBeVisible();
  await expect(page.getByRole("region", { name: "Public room map" })).toHaveClass(/leaflet-container/);
  await expect(page.locator(".leaflet-marker-icon.room-pin-wrapper")).toHaveCount(1);
  const signIn = page.getByRole("button", { name: "Continue with Google" });
  await signIn.scrollIntoViewIfNeeded();
  await expect(signIn).toBeVisible();
  await expect(signIn).toBeInViewport();
});
