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

async function fixtureState(page: Page) {
  return page.evaluate(async () => fetch("/__fixture/state").then((response) => response.json()));
}

async function selectAnchor(page: Page) {
  await page.locator(".leaflet-marker-icon.room-pin-wrapper[title='Fixture anchor room']").click();
  await expect(page).toHaveURL(new RegExp(`room=${anchorRoomId}`));
  await expect(page.getByRole("heading", { name: "Fixture anchor room" })).toBeVisible();
}

async function sendMessage(page: Page, body: string) {
  await page.getByLabel("Message", { exact: true }).fill(body);
  await page.getByRole("button", { name: "Send message" }).click();
  const canonical = page.locator(".message-item", { hasText: body });
  await expect(canonical).toHaveCount(1);
  await expect(page.locator(".message-attempt", { hasText: body })).toHaveCount(0);
}

async function createFromMap(page: Page) {
  const map = page.getByRole("region", { name: "Public room map" });
  const box = await map.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.click(box!.x + box!.width * .75, box!.y + box!.height * .72);
  await page.getByRole("button", { name: "Create room here" }).click();
}

test("two contexts reconcile message ordering, room isolation, and multi-page reconnect catch-up", async ({ browser }) => {
  test.setTimeout(30_000);
  const firstContext = await browser.newContext();
  const secondContext = await browser.newContext();
  try {
    const [{ page: firstPage, tileRequests: firstTiles }, { page: secondPage, tileRequests: secondTiles }] =
      await Promise.all([openContext(firstContext), openContext(secondContext)]);
    await expect.poll(() => firstTiles.length > 0 && secondTiles.length > 0).toBe(true);

    await Promise.all([selectAnchor(firstPage), selectAnchor(secondPage)]);
    await expect.poll(async () => (await fixtureState(firstPage)).subscriptions).toBeGreaterThanOrEqual(2);

    await sendMessage(firstPage, "Socket arrived before HTTP");
    await expect(secondPage.locator(".message-item", { hasText: "Socket arrived before HTTP" })).toHaveCount(1);

    await firstPage.evaluate(async () => {
      const response = await fetch("/__fixture/message-order", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ order: "http-before-socket" })
      });
      if (!response.ok) throw new Error(`fixture order returned ${response.status}`);
    });
    await sendMessage(firstPage, "HTTP arrived before socket");
    await expect(secondPage.locator(".message-item", { hasText: "HTTP arrived before socket" })).toHaveCount(1);
    await expect(firstPage.locator(".message-item", { hasText: "HTTP arrived before socket" })).toHaveCount(1);

    await createFromMap(firstPage);
    await expect(firstPage.locator(".leaflet-marker-icon.room-pin-wrapper")).toHaveCount(2);
    await expect(secondPage.locator(".leaflet-marker-icon.room-pin-wrapper")).toHaveCount(2);
    await expect(firstPage.getByRole("heading", { name: "Fixture room 1" })).toBeVisible();
    await sendMessage(firstPage, "Other room only");
    await expect(secondPage.locator(".message-item", { hasText: "Other room only" })).toHaveCount(0);

    await selectAnchor(firstPage);
    await secondContext.setOffline(true);
    await expect(secondPage.getByText("Live room updates interrupted. Reconnecting…")).toBeVisible();
    const missedBodies = Array.from({ length: 31 }, (_, index) => `Missed message ${index + 1}`);
    await firstPage.evaluate(async ({ roomId, bodies }) => {
      for (const body of bodies) {
        const response = await fetch(`/api/rooms/${roomId}/messages`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ body, clientRequestId: crypto.randomUUID() })
        });
        if (response.status !== 201) throw new Error(`fixture message returned ${response.status}`);
      }
    }, { roomId: anchorRoomId, bodies: missedBodies });
    await expect(firstPage.getByText(missedBodies[0]!, { exact: true })).toHaveCount(1);
    await expect(firstPage.getByText(missedBodies.at(-1)!, { exact: true })).toHaveCount(1);
    await expect(secondPage.locator(".message-item", { hasText: "Missed message" })).toHaveCount(0);

    await secondContext.setOffline(false);
    await expect(secondPage.getByText("Live room updates recovered.")).toBeVisible({ timeout: 10_000 });
    await expect(secondPage.locator(".message-item")).toHaveCount(34);
    await expect(secondPage.getByText(missedBodies[0]!, { exact: true })).toHaveCount(1);
    await expect(secondPage.getByText(missedBodies.at(-1)!, { exact: true })).toHaveCount(1);
    await expect(secondPage).toHaveURL(new RegExp(`room=${anchorRoomId}`));
    await expect(secondPage.getByRole("heading", { name: "Fixture anchor room" })).toBeVisible();

    const state = await fixtureState(firstPage);
    expect(state).toMatchObject({
      broadcasts: 1,
      messageAfterRequests: 2,
      messageBroadcasts: 34,
      messageCount: 35,
      messagePosts: 34,
      postCount: 1,
      roomCount: 2
    });
    expect(state.connections).toBeGreaterThanOrEqual(3);
    expect(state.subscriptions).toBeGreaterThanOrEqual(5);
    expect(state.transports).toContain("websocket");
    expect(state.orderLog.slice(0, 4)).toEqual([
      "socket-before-http:event",
      "socket-before-http:http",
      "http-before-socket:http",
      "http-before-socket:event"
    ]);
  } finally {
    await firstContext.close();
    await secondContext.close();
  }
});
