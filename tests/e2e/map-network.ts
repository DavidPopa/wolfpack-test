import type { Page } from "@playwright/test";

const neutralTile = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64"
);

export async function interceptStadiaTiles(page: Page) {
  const tileRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().startsWith("https://tiles.stadiamaps.com/")) tileRequests.push(request.url());
  });
  await page.route("https://tiles.stadiamaps.com/**", (route) => route.fulfill({
    status: 200,
    contentType: "image/png",
    body: neutralTile
  }));
  return tileRequests;
}
