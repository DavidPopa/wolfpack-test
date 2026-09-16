# Map source, license, and attribution decision

Status: **APPROVED — Option A, Stadia Maps / Stamen Watercolor, for evaluation/non-commercial proof-of-concept use**
Evidence accessed: **2026-09-16**

## Decision summary

The supplied CodePen is recoverable through CodePen's official `cdpn.io` embed endpoint. It uses Leaflet 1.1.0 with the original Stamen Watercolor raster tiles. The exact recovered tile template is:

```text
http://{s}.tile.stamen.com/watercolor/{z}/{x}/{y}.png
```

That template is not usable now: the hostname did not resolve during the 2026-09-16 check, it is HTTP-only, and [Stamen states that its original tile URLs stopped working on 2023-10-31](https://stamen.com/stamen-x-stadia-the-end-of-the-road-for-stamens-legacy-map-tiles/).

The closest current replacement is Stadia Maps' hosted copy of the original Stamen Watercolor raster tiles. On 2026-09-16, the developer approved **Option A** for this hiring assessment and classified the current use as an evaluation/non-commercial proof of concept. The free tier is not approved for a commercial deployment. Any later commercial use requires a fresh licensing review and an active paid plan; a public preview must use Stadia's documented domain authentication and preserve all required attribution.

**Option B** remains documented only as a visually different fallback and is not selected or approved for implementation.

## Recovered reference evidence

### CodePen

The canonical [CodePen URL](https://codepen.io/riko11/pen/GExZzQ), its `full`, `.html`, `.css`, `.js`, `embed`, and oEmbed forms returned Cloudflare HTTP 403 to direct retrieval on 2026-09-16. CodePen's official [full embed endpoint](https://cdpn.io/riko11/fullembedgrid/GExZzQ?animations=run&type=embed) returned HTTP 200 and exposed the Pen titled `Wolfchatter`.

The recovered source contains:

- HTML: one `<div id="map"></div>`;
- CSS: the page and `#map` are 100% width/height;
- Leaflet CSS and JavaScript: `https://unpkg.com/leaflet@1.1.0/dist/leaflet.css` and `https://unpkg.com/leaflet@1.1.0/dist/leaflet.js`;
- ancillary Pen assets: Normalize 5.0.0 and Prefixfree 1.0.7;
- map center `[46.7712, 23.6236]` (Cluj-Napoca) and initial zoom `5`;
- tile template `http://{s}.tile.stamen.com/watercolor/{z}/{x}/{y}.png`;
- no tile-layer `attribution`, `maxZoom`, authentication, or usage-limit configuration.

The old tile host was checked with both HTTP and HTTPS on 2026-09-16 and failed DNS resolution. No proprietary tile or Pen asset was copied into this repository.

### Assessment PDF

The local assessment PDF, `/Users/dxd/Desktop/Fullstack Developer Test Wolfpack Digital 2026.pdf`, says to use the provided map and links to the CodePen. Its page 3 and page 4 mockups visibly show a watercolor-style map of Europe and the default `Leaflet` mark at bottom-right. They do **not** visibly identify Stamen, a tile URL, a license, a Leaflet version, or provider usage terms.

Before source recovery, identifying the mockup as Stamen Watercolor would only have been a visual inference. The recovered CodePen source independently confirms that provider and style.

## Leaflet decision

- Historical reference: Leaflet **1.1.0**.
- Implementation range: Leaflet **1.9.x**, constrained to `>=1.9.4 <2.0.0`; Phase 003 should initially pin **1.9.4** exactly. Leaflet's [official download page](https://leafletjs.com/download.html) still identifies 1.9.4 as stable and 2.0.0-alpha.1 as a prerelease, so the prerelease is outside the approved range.
- License: BSD 2-Clause. Both the [v1.1.0 license](https://github.com/Leaflet/Leaflet/blob/v1.1.0/LICENSE) and the [current license](https://github.com/Leaflet/Leaflet/blob/main/LICENSE) require preservation of the copyright notice, conditions, and disclaimer in source distributions and in documentation or other materials accompanying binary distributions.
- Attribution separation: Leaflet's UI prefix is not a substitute for map-data/style attribution. Keep the normal Leaflet prefix unless a later design decision has a reason to change it, and always add the selected provider's complete visible attribution through the tile layer.

## Provider options

### Option A - Stadia Maps / Stamen Watercolor (approved for this evaluation proof of concept)

This is the visual and technical successor to the recovered reference. Stadia's [official Watercolor documentation](https://docs.stadiamaps.com/map-styles/stamen-watercolor/) describes it as the original Stamen Design raster tileset and provides this Leaflet configuration:

```ts
const tileUrl =
  "https://tiles.stadiamaps.com/tiles/stamen_watercolor/{z}/{x}/{y}.jpg";

const tileOptions = {
  maxZoom: 16,
  attribution:
    '&copy; <a href="https://stadiamaps.com/attribution/" target="_blank">Stadia Maps</a> ' +
    '<a href="https://stamen.com/" target="_blank">&copy; Stamen Design</a> ' +
    '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>',
};
```

Parameters and constraints:

- XYZ raster JPG template with `{z}`, `{x}`, and `{y}`; no `{s}` subdomain parameter.
- Set `maxZoom: 16`. Stadia warns that the original tileset has missing tiles, especially at higher zoom levels, and recommends not requesting above zoom 16.
- The exact visible, linked attribution must name **Stadia Maps**, **Stamen Design**, and **OpenStreetMap**. Stadia's [attribution requirements](https://docs.stadiamaps.com/attribution/) say Watercolor does not require an OpenMapTiles credit. Attribution must remain prominent and must not be hidden by the chat panel or other controls.
- OpenStreetMap data is licensed under the ODbL; its [copyright page](https://www.openstreetmap.org/copyright) requires an attribution notice and a link to the license/copyright information.
- Stadia's [authentication guidance](https://docs.stadiamaps.com/authentication/) permits keyless local browser development on `localhost` or `127.0.0.1`, subject to strict rate limits. Production browser apps should use domain-based authentication, which validates browser `Origin`/`Referer` headers and avoids exposing an API key.
- Do not set `Referrer-Policy: no-referrer`; Stadia documents `strict-origin-when-cross-origin` as compatible for HTTPS sites.
- As recorded on Stadia's [pricing page](https://stadiamaps.com/pricing/) on 2026-09-16, the free plan includes 200,000 credits/month, standard raster tiles cost 1 credit/tile, the free plan has no additional usage, and commercial use is not allowed. Stadia's [terms](https://stadiamaps.com/terms-of-service/) require an active paid subscription for commercial use and prohibit obscuring attribution, abusive/bulk access, circumvention of limits, and unapproved server-side caching.

The developer approved this option on 2026-09-16 for evaluation/non-commercial proof-of-concept use only. No account, domain, key, payment, commercial deployment, or commercial free-tier use was approved or created by this task.

### Option B - OpenStreetMap Standard raster (fallback, not selected)

This is a compatible Leaflet raster source, but it does not preserve the assessment's watercolor appearance:

```ts
const tileUrl = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

const tileOptions = {
  maxZoom: 19,
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
};
```

The [official OSM tile policy](https://operations.osmfoundation.org/policies/tiles/) requires the HTTPS URL above, clearly visible on-map attribution, a valid Referer from websites, normal HTTP caching (or at least seven days when cache headers cannot be read), and no bulk download, prefetch, or offline use. The service is best-effort with no SLA; heavy or non-compliant use may be blocked without notice. It is suitable only as a deliberately approved low-volume fallback, not as an invisible automatic failover from Stadia.

## Safe configuration and failure behavior

- Commit a small browser-safe provider catalog containing the approved provider ID, tile template, `maxZoom`, and exact attribution. Do not put arbitrary attribution HTML or arbitrary tile URLs into runtime environment variables.
- A public selector such as `NEXT_PUBLIC_MAP_PROVIDER=stadia-watercolor` is safe because it is not a credential. The provider's production domain registration is external operational configuration, not source code.
- For the approved browser integration, prefer Stadia domain authentication and no key. Never place a Stadia API key in `NEXT_PUBLIC_*`, client bundles, logs, screenshots, or Git. If a later server-side use genuinely requires a key, keep it in a server-only secret such as `STADIA_MAPS_API_KEY`; that change requires its own scoped task.
- Local interactive development may use Stadia's documented keyless localhost access. On HTTP 401 or repeated 429 responses, show an explicit map-unavailable state; do not silently change providers because the alternate license, attribution, appearance, and limits differ.
- Unit/component tests should mock the Leaflet/tile boundary and assert provider URL selection, max zoom, attribution content, error state, and that map clicks are distinct from marker clicks.
- Chromium tests should intercept external tile requests and return a generated neutral test tile or block them intentionally; they must still assert the visible attribution and interaction behavior. Do not check proprietary tiles into the repository. A separate manual provider smoke may request real tiles only after the applicable localhost or domain authentication is configured.

## Phase 003 gate

The provider decision gate is **RESOLVED**:

- approved provider/style: **Stadia Maps / Stamen Watercolor**;
- approved use classification: **evaluation/non-commercial proof of concept** for the hiring assessment;
- free-tier commercial deployment: **not approved**;
- public preview requirement: Stadia domain authentication plus complete visible Stadia Maps, Stamen Design, and OpenStreetMap attribution;
- later commercial use: new licensing review and active paid plan required.

Phase 003 may implement this decision only after `docs/MAP.md` is reviewed, committed and integrated into its exact approved baseline. Automated Chromium tests continue to intercept external tiles. A separate real-provider browser smoke remains required after appropriate localhost or domain authentication is configured. This task made no application, dependency, lockfile, provider-account, payment, secret, or map implementation change.
