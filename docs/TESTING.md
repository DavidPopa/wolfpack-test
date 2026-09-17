# Testing

This is the integrated testing contract for the current rooms, map and chat product. It covers public room/message reads, authenticated idempotent writes, PostgreSQL ordering and uniqueness, Redis rate limits, optimistic UI state, Leaflet interaction, room-scoped Socket.IO delivery, reconnect catch-up, responsive layout and accessibility behavior.

Focused task evidence is useful during implementation, but only the complete ordered sequence on one exact snapshot can support final local delivery. Real Google OAuth, live Stadia access, local gates, GitHub Actions and deployment are separate evidence classes.

## Ordered gates

Run setup and gates from the repository root in this order:

```sh
pnpm services:test:up
pnpm db:validate
pnpm db:generate
pnpm exec playwright install chromium
pnpm lint
pnpm typecheck
pnpm test:api:unit
pnpm test:api:integration
pnpm test:web
pnpm build
pnpm stack:up
pnpm test:e2e
pnpm test:tooling
pnpm hooks:check
pnpm stack:stop
pnpm services:test:stop
```

| Order | Command | Responsibility |
| --- | --- | --- |
| Setup | `pnpm services:test:up` | Start isolated `wolfpack-test` PostgreSQL/Redis and deploy committed migrations. |
| Setup | `pnpm db:validate` | Validate the Prisma schema against the isolated test configuration. |
| Setup | `pnpm db:generate` | Generate the ignored Prisma client explicitly. |
| Setup | `pnpm exec playwright install chromium` | Install the browser used by Playwright; CI uses `--with-deps`. |
| 1 | `pnpm lint` | Repository ESLint with zero warnings allowed. |
| 2 | `pnpm typecheck` | Prisma generation plus contracts, API and web TypeScript. |
| 3a | `pnpm test:api:unit` | Backend unit/mocked-boundary contracts, services, routers, events and lifecycle. |
| 3b | `pnpm test:api:integration` | Real isolated PostgreSQL/Redis and real Node Socket.IO client/server integration. |
| 4 | `pnpm test:web` | Complete web Jest/React Testing Library suite with controlled browser-boundary mocks. |
| 5 | `pnpm build` | Production contracts, API and Next.js builds. |
| 6 | `pnpm test:e2e` | Unfiltered aggregate Chromium gate across production and dedicated realtime origins. |
| 7 | `pnpm test:tooling` | Node tests for the E2E runner, Codex guard and hook contract. |
| 8 | `pnpm hooks:check` | Actual pre-commit command: lint, types, API unit/integration and web Jest. |
| Cleanup | `pnpm stack:stop` then `pnpm services:test:stop` | Stop only owned resources while preserving volumes. |

Resolve or diagnose a failed gate before relying on later evidence. Do not exclude, rename, filter or skip a collected test to manufacture a pass. A focused command does not replace its complete suite, and a Docker diagnostic does not silently replace an exact required host command.

## Suite map

### Backend unit tests

`jest.config.api.unit.mjs` collects `apps/api/src/**/*.unit.test.ts` and runs serially. Current coverage includes:

- health/readiness, configuration redaction and application/runtime cleanup;
- Google as the only Better Auth provider and server-derived identity;
- bounded, hashed, atomic room/message limiter behavior and stable retry/error mappings;
- public room projection and stable room ordering;
- room creation validation, replay/conflict, uniqueness-race recovery and `room.created` publication;
- strict public message/privacy contracts, canonical opaque cursor parsing and newest/before/after page behavior;
- message create normalization, lookup-before-limit idempotency, HTTP status mapping and uniqueness recovery;
- strict message subscription payloads, one-current-room transitions and created-only `message.created` publication.

These tests use mocked dependencies or in-process HTTP boundaries. They do not establish real PostgreSQL constraints, Redis expiry, browser transport, production proxy behavior or Google OAuth.

### Backend integration tests

`jest.config.api.integration.mjs` collects `apps/api/src/**/*.integration.test.ts`, runs one worker and expects PostgreSQL at `127.0.0.1:55431` plus Redis at `127.0.0.1:56381`. Current real-service coverage includes:

- migrated Better Auth/domain tables, foreign keys, room/message request-ID uniqueness and ordering indexes;
- persisted session resolution and trusted-origin logout using test-created database records;
- public room reads and chronological message history with exact public fields;
- message newest, repeated `before` and repeated `after` traversal, including equal timestamps, empty/unknown rooms and exact cleanup;
- room/message `201` creation, canonical `200` replay, changed-payload/room `409`, concurrent identical requests and exactly one PostgreSQL row;
- real Redis increments, expiry/recreation and exact-key cleanup for write limits;
- protected-write failure when the limiter command rejects, while public reads remain available;
- real Socket.IO polling/WebSocket clients, room isolation, persistence-before-event, switch/unsubscribe/disconnect and zero events for replay/failure.

The auth fixtures prove the production server boundary and persisted session semantics, not Google consent/redirect/callback. The Redis-outage mapping uses a deliberately rejected atomic command while Redis-backed positive/expiry cases use the real service; it does not measure live network-outage latency.

### Frontend Jest and React Testing Library

`jest.config.web.mjs` collects `apps/web/**/*.test.tsx` in jsdom. Leaflet, fetch, Better Auth and Socket.IO are mocked at explicit browser boundaries. Current coverage includes:

- auth loading/signed-out/signed-in/error behavior, Google-only intent and safe same-origin return targets;
- room list/map selection, URL/draft restoration and explicit auth-return creation;
- optimistic room creation, stable retry identity, targeted rollback and late-selection protection;
- public message newest/empty/error/retry states, multi-page older loading, chronological deduplication and room-switch isolation;
- same-room scroll anchoring and foreign-room anchor rejection;
- composer auth gating, normalization, pending/confirmed/failed states, all defined HTTP errors, stable retry versus new attempt IDs and concurrent late outcomes;
- one socket lifecycle, strict selected-room events, HTTP/socket ordering in both directions, duplicate suppression and targeted attempt resolution;
- reconnect coalescing, repeated `after` pages, no-edge newest recovery, cancellation on selection change and visible-data preservation on failure;
- near-bottom auto-follow, non-bottom new-message control/count, one-shot announcements, focus ownership and semantic time/image/plain-text rendering.

RTL establishes deterministic component/query/cache behavior under controlled mocks. It does not prove real Leaflet layout, network transport, PostgreSQL/Redis, production nginx, live provider access or Google OAuth.

### Chromium E2E

`playwright.config.ts` assigns every `tests/e2e/*.spec.ts` file to exactly one named project. `scripts/run-e2e.mjs` validates the files on disk before either project runs.

- `production-chromium` defaults to `http://127.0.0.1:8081`. `foundation.spec.ts` covers the production page, anonymous same-origin session request, API health/JSON 404, disabled password signup, mobile auth reachability and Socket.IO polling/WebSocket through nginx. `map.spec.ts` uses production Leaflet with deterministic room/session responses and intercepted tiles to cover persisted pins, exact visible attribution, zoom, selection/draft exclusivity, wrapped longitude, URL/auth-return restoration, explicit room creation, keyboard focus and desktop/mobile reflow.
- `realtime-chromium` defaults to `http://127.0.0.1:18081` and owns `room-realtime.spec.ts`. The runner creates an isolated bridge network, fixture/API container, production web-image container and nginx proxy. The scenario uses independent desktop/mobile contexts and real browser Socket.IO to cover message arrival in both HTTP/socket orders, exactly-once display, room isolation, optimistic confirmation/failure retry, selection retention, 31 missed messages recovered across two forward pages, older-page anchoring, reader-controlled live scrolling and viewport overflow checks.

The realtime fixture uses `.invalid` identity plus in-memory room/message/session state. It is test-only and is not imported by production. Its browser transport is real, but its persistence/auth is not PostgreSQL, Redis, Better Auth or Google.

Every Chromium scenario installs `interceptStadiaTiles` before navigation. Tests therefore prove Leaflet URL construction, rendering integration, attribution and UI behavior without proving live Stadia authentication, availability, quotas or licensing eligibility.

The unfiltered `pnpm test:e2e` command runs both projects. It requires the separately started production proxy, verifies every current spec has exactly one owner, refuses occupied/unknown fixture resources, resolves the exact images currently tagged by the production build, propagates child failures, terminates an in-flight owned child process group on interruption and removes only exact recorded fixture container/network IDs in `finally`. It never stops the production stack or removes a volume.

## Evidence boundaries

| Evidence | Establishes | Does not establish |
| --- | --- | --- |
| Static source/config audit | Wiring, schemas, documented paths/configuration and absence of obvious scope/secret drift | Runtime behavior |
| API unit Jest | Business and HTTP/event control flow at mocked boundaries | Real database, Redis, transport, proxy or OAuth |
| API integration Jest | Real PostgreSQL/Redis state and real Node Socket.IO transport exercised by those suites | Browser behavior, Google OAuth or live provider access |
| Web RTL | UI/cache/error/race behavior under controlled mocks | Real layout, services, browser transport, proxy or OAuth |
| Production Chromium | Browser/UI and the actual proxy/transport boundary used by each scenario | Any intercepted or fixture-backed external dependency |
| Fixture/test session | Session-shaped or persisted test-session behavior | Google consent, redirect, callback or account login |
| Intercepted Stadia tiles | Deterministic map integration and visible attribution | Live provider access, domain authentication or quotas |
| Local ordered gates | The recorded local snapshot/environment | PR CI or a different commit |
| GitHub Actions run | The recorded SHA and workflow run | OAuth/live-provider behavior unless explicitly added |
| Coverage-enabled run | Coverage for collected/instrumented files in that command | A general coverage claim from ordinary gates |

Real Google OAuth is `NOT_RUN` unless a separate sanitized smoke records origin/callback, account class, login/session/logout result and tested SHA without credentials, cookies or tokens. Live Stadia is similarly `NOT_RUN` unless a separately authorized browser smoke uses the approved configuration.

## Runtime ownership and cleanup

- Inspect worktrees, containers and listeners before mutation. Stop on any ownership collision; never reuse another checkout's runtime as evidence.
- `pnpm services:test:up` owns Compose project `wolfpack-test`, PostgreSQL `127.0.0.1:55431` and Redis `127.0.0.1:56381`. Tests use exact SQL fixtures and scoped Redis prefixes.
- `pnpm stack:up` owns Compose project `wolfpack` and publishes only nginx at `127.0.0.1:8081`. Preserve `wolfpack_postgres-data`.
- `pnpm test:e2e` owns only its configurable realtime proxy/container/network set. Defaults are proxy `127.0.0.1:18081`, internal ports `4108`/`3108`, containers `wolfpack-e2e-realtime-fixture`, `wolfpack-e2e-realtime-web`, `wolfpack-e2e-realtime-proxy`, and network `wolfpack-e2e-realtime`. Override the matching `ROOM_REALTIME_*` names/ports together.
- Stop with `pnpm stack:stop` and `pnpm services:test:stop`. Never use `down --volumes`, reset a database, run Redis `FLUSH*`, prune broadly or delete another task's reports/traces.
- Do not print or retain credentials, OAuth tokens, cookies, real environment values or session files in logs, screenshots, traces or reports.

## Evidence recording and failures

Record base/HEAD, branch/worktree, dirty paths, timestamp, runtime versions, ownership, exact command/exit, collected suites/tests and sanitized artifacts. Inspect collection instead of trusting only exit zero.

A failed gate remains `FAIL` or `BLOCKED` until corrected and rerun. No `--passWithNoTests`, broad skip, hidden filter, assertion weakening or historical output may substitute for current evidence. Final task-008 QA owns the complete ordered sequence on the final stacked snapshot; task-level passes remain useful but cannot replace it.
