import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { interceptStadiaTiles } from "./map-network";

const anchorRoomId = "11111111-1111-4111-8111-111111111111";

async function openContext(context: BrowserContext) {
  const page = await context.newPage();
  const tileRequests = await interceptStadiaTiles(page);
  await page.goto("/");
  await expect(page.locator(".leaflet-marker-icon.room-pin-wrapper")).toHaveCount(1);
  await expect(page.getByText("Live room updates connected.")).toBeVisible();
  return { page, tileRequests };
}

async function createFromMap(page: Page) {
  const map = page.getByRole("region", { name: "Public room map" });
  const box = await map.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.click(box!.x + box!.width * .75, box!.y + box!.height * .72);
  await page.getByRole("button", { name: "Create room here" }).click();
}

test("two contexts reconcile real delivery and one recovers multiple missed rooms after reconnect", async ({ browser }) => {
  const firstContext = await browser.newContext();
  const secondContext = await browser.newContext();
  try {
    const [{ page: firstPage, tileRequests: firstTiles }, { page: secondPage, tileRequests: secondTiles }] =
      await Promise.all([openContext(firstContext), openContext(secondContext)]);
    await expect.poll(() => firstTiles.length > 0 && secondTiles.length > 0).toBe(true);

    const secondAnchor = secondPage.locator(".leaflet-marker-icon.room-pin-wrapper[title='Fixture anchor room']");
    await secondAnchor.click();
    await expect(secondPage).toHaveURL(new RegExp(`room=${anchorRoomId}`));
    await expect(secondPage.getByRole("heading", { name: "Fixture anchor room" })).toBeVisible();

    await createFromMap(firstPage);
    await expect(firstPage.locator(".leaflet-marker-icon.room-pin-wrapper")).toHaveCount(2);
    await expect(secondPage.locator(".leaflet-marker-icon.room-pin-wrapper")).toHaveCount(2);
    await expect(firstPage.locator(".leaflet-marker-icon.saving-pin-wrapper")).toHaveCount(0);
    await expect(secondPage.locator(".leaflet-marker-icon.room-pin-wrapper[title='Fixture room 1']")).toHaveCount(1);

    await secondContext.setOffline(true);
    await expect(secondPage.getByText("Live room updates interrupted. Reconnecting…")).toBeVisible();
    await firstPage.evaluate(async () => {
      const payloads = [
        { latitude: 41, longitude: 21, clientRequestId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
        { latitude: 42, longitude: 22, clientRequestId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" }
      ];
      for (const payload of payloads) {
        const response = await fetch("/api/rooms", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload)
        });
        if (response.status !== 201) throw new Error(`fixture create returned ${response.status}`);
      }
    });
    await expect(firstPage.locator(".leaflet-marker-icon.room-pin-wrapper")).toHaveCount(4);
    await expect(secondPage.locator(".leaflet-marker-icon.room-pin-wrapper")).toHaveCount(2);

    await secondContext.setOffline(false);
    await expect(secondPage.getByText("Live room updates recovered.")).toBeVisible({ timeout: 10_000 });
    await expect(secondPage.locator(".leaflet-marker-icon.room-pin-wrapper")).toHaveCount(4);
    await expect(secondPage.getByRole("heading", { name: "Fixture anchor room" })).toBeVisible();
    await expect(secondPage).toHaveURL(new RegExp(`room=${anchorRoomId}`));
    await expect(secondPage.locator(".leaflet-marker-icon.room-pin-wrapper[title='Fixture room 2']")).toHaveCount(1);
    await expect(secondPage.locator(".leaflet-marker-icon.room-pin-wrapper[title='Fixture room 3']")).toHaveCount(1);

    const fixtureState = await firstPage.evaluate(async () => fetch("/__fixture/state").then((response) => response.json()));
    expect(fixtureState).toMatchObject({
      broadcasts: 3,
      postCount: 3,
      roomCount: 4,
      roomGetCount: 3
    });
    expect(fixtureState.connections).toBeGreaterThanOrEqual(3);
    expect(fixtureState.transports).toContain("websocket");
  } finally {
    await firstContext.close();
    await secondContext.close();
  }
});
