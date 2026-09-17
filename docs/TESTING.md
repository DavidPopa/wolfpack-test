# Testing

This is the integrated testing contract through Phase 003. It covers the foundation, Google-only session boundary, public room listing, authenticated/idempotent room creation, atomic Redis rate limiting, Leaflet room selection, optimistic UI behavior, room Socket.IO delivery, and reconnect reconciliation.

Message history, pagination, message sending/composer behavior, message subscriptions, and message realtime remain Phase 004 work and are not claimed here.

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

| Order | Command | Current responsibility |
| --- | --- | --- |
| Setup | `pnpm services:test:up` | Start the isolated `wolfpack-test` PostgreSQL/Redis pair and deploy committed migrations. |
| Setup | `pnpm db:validate` | Validate the Prisma schema against the isolated test configuration. |
| Setup | `pnpm db:generate` | Generate the ignored Prisma client explicitly before consumers run. |
| Setup | `pnpm exec playwright install chromium` | Install the browser used by the Playwright project. CI uses `--with-deps`. |
| 1 | `pnpm lint` | ESLint, check-only. |
| 2 | `pnpm typecheck` | Prisma generation plus contracts, API and web TypeScript checks. |
| 3a | `pnpm test:api:unit` | Backend Jest unit suites for infrastructure, auth, configuration, room contracts/services/events, and the Redis limiter boundary. |
| 3b | `pnpm test:api:integration` | Backend Jest against isolated real PostgreSQL/Redis, including auth persistence, schema constraints, public rooms, room creation and real Socket.IO delivery. |
| 4 | `pnpm test:web` | Frontend Jest/React Testing Library for auth state, room map/selection, optimistic creation and client realtime reconciliation. |
| 5 | `pnpm build` | Production contracts, API and Next.js builds. |
| 6 | `pnpm test:e2e` | Validate complete spec-to-project ownership, run the production and realtime Chromium projects against their isolated origins, aggregate child failures, and clean up the dedicated fixture runtime. |
| 7 | `pnpm test:tooling` | Node tests for the Codex guard and hook contract. |
| 8 | `pnpm hooks:check` | The actual Husky entrypoint: lint, types, API unit, API integration, then web Jest. |

Resolve or diagnose a failed gate before relying on later evidence. Focused commands are useful while implementing a task but never replace the complete integrated sequence. Do not exclude, rename, filter, or skip a collected test to manufacture a full-suite pass.

The root `dev`, `typecheck`, API unit/integration and `build` scripts regenerate the ignored Prisma client before API runtime code consumes it. The explicit `db:generate` setup step keeps generation visible in evidence. `services:test:up` and `test:api:integration` deploy committed migrations idempotently.

## Suite map

### Backend unit tests

`jest.config.api.unit.mjs` collects `apps/api/src/**/*.unit.test.ts` and runs serially through the API workspace script. Current tests cover:

- health, readiness timeout/redaction, JSON 404 and application-construction boundaries;
- Google as the only Better Auth provider and identity derived only from a verified session;
- validated rate-limit configuration, hashed/bounded keys, one atomic Redis evaluation, threshold/retry math, malformed replies and fail-closed provider errors;
- public room projection, stable `createdAt` then `id` ordering, strict browser-safe contracts and no auth lookup for reads;
- strict room-create requests and error responses, server-derived titles, replay/conflict ordering, canonical unique-race recovery and persistence-error handling;
- strict `room.created` payloads and created-only publisher behavior;
- runtime resource cleanup.

These are unit or mocked-boundary assertions. They do not prove PostgreSQL constraints, Redis expiry, browser behavior, network transport, Google OAuth, or the production proxy.

### Backend integration tests

`jest.config.api.integration.mjs` collects `apps/api/src/**/*.integration.test.ts`, runs with one worker, and expects the isolated services on PostgreSQL `127.0.0.1:55431` and Redis `127.0.0.1:56381`.

Current real-service coverage includes:

- SQL round trips; migrated Better Auth/domain tables; Room/Message foreign keys, request-id uniqueness and ordering indexes;
- persisted Better Auth session resolution and trusted-origin logout using test-created database records;
- guest public room reads, exact public fields, and stable room ordering;
- room creation with session-derived fixture identity, strict validation, server title/precision, sequential replay, conflicting reuse, concurrent identical requests, one canonical PostgreSQL row, rate limiting, and public-read availability when the limiter fails;
- real Redis concurrent increments, positive expiry, no-expiry repair, expiry/recreation, live sub-second expiry preservation and exact-key cleanup;
- real Socket.IO polling and WebSocket clients receiving one canonical event for a newly persisted room, with no event for replay/conflict/auth/validation/rate/Redis/database failures and no dependency on connected clients.

The database/session fixtures prove Better Auth persistence and server authority, not a Google provider redirect or callback. Successful limiter state/expiry cases use real Redis; the unavailable-write mapping injects a rejected Redis command at the limiter boundary rather than stopping the Redis container, so it does not prove live network-outage timing.

### Frontend Jest and React Testing Library

`jest.config.web.mjs` collects `apps/web/**/*.test.tsx` in jsdom. Leaflet, fetch, Better Auth and Socket.IO are mocked at their explicit browser boundaries.

Current coverage includes:

- same-origin Better Auth client setup; loading, signed-out, signed-in and recoverable session/action states;
- safe same-origin callback targets and Google-only sign-in intent;
- room query loading, empty/error/retry states, strict response parsing and marker reconciliation;
- persisted marker selection by mouse/keyboard; empty-map drafts; hostile/ambiguous/out-of-range URL rejection; replacement/history behavior; auth-return restoration without automatic writes;
- room-create `201` and idempotent `200`; validation, `401`, `409`, `429`, `503` and network failure; stable retry IDs; targeted rollback; a second pending attempt; concurrent room updates; and late-result selection protection;
- strict room-event parsing, socket-before-HTTP and HTTP-before-socket convergence, duplicate suppression, stale-GET merging, one client/listener lifecycle, cleanup, coalesced reconnect refresh and multiple missed-room recovery.

RTL demonstrates component/cache behavior under controlled mocks. It does not prove Leaflet rendering, real services, Socket.IO network transport, Google OAuth, or the production proxy.

### Chromium E2E

`playwright.config.ts` assigns every `tests/e2e/*.spec.ts` file to exactly one named Chromium project. `scripts/run-e2e.mjs` verifies that assignment against the files on disk before running either project.

- `production-chromium` uses `http://127.0.0.1:8081` by default. `tests/e2e/foundation.spec.ts` checks the production page, anonymous same-origin auth request, health/JSON 404, disabled password signup, mobile auth reachability, and Socket.IO polling plus forced WebSocket through nginx. `tests/e2e/map.spec.ts` uses real production Leaflet with deterministic intercepted room/session responses and checks persisted pins, exact visible attribution, zoom cap, selection/draft exclusivity, wrapped longitude, URL/auth-return restoration, keyboard focus and desktop/mobile reflow.
- `realtime-chromium` uses `http://127.0.0.1:18081` by default and contains only `tests/e2e/room-realtime.spec.ts`. The root runner starts `tests/e2e/room-realtime-fixture.mjs`, a second container from the exact image ID currently tagged `wolfpack-web:latest`, and the nginx template in `tests/e2e/room-realtime.nginx.conf` on one task-owned bridge network. Stable aliases connect the three containers without a host gateway; only nginx publishes a loopback port. The scenario proves real browser Socket.IO transport, one event in both contexts, missed-room reconnect recovery, deduplication and selection retention. Its HTTP/session persistence is in-memory and it does not use PostgreSQL, Redis, Better Auth, or Google.

All current browser scenarios call `interceptStadiaTiles` from `tests/e2e/map-network.ts`; external Stadia requests receive an in-memory neutral tile. Chromium therefore proves URL construction, Leaflet integration, visible attribution and UI behavior without proving live Stadia availability, limits or domain authentication.

The unfiltered `pnpm test:e2e` command is the aggregate gate. It requires the separately started `wolfpack` production proxy, collision-checks the configurable realtime proxy port plus all container/network names, then runs both projects without a file or grep filter. A child failure or fixture startup error makes the root command non-zero. On `SIGINT`/`SIGTERM`, the runner terminates and awaits the in-flight owned Playwright/failure process group before `finally` cleanup. Cleanup verifies recorded Docker IDs before removing the three containers and network, preventing a same-name replacement from being removed. Tooling tests fail when a new spec lacks an owner, when the realtime project is omitted, when child status is swallowed, when the container-only topology regresses, or when abort/cleanup escapes recorded ownership.

## Evidence boundaries

| Evidence | What it can establish | What it cannot establish |
| --- | --- | --- |
| Static source/config audit | Wiring, strict schemas, configured paths/providers, exclusions and absence of obvious secret/scope drift | Runtime behavior |
| API unit Jest | Business/control-flow behavior at mocked dependencies | Real PostgreSQL, Redis, sockets or proxy |
| API integration Jest | Real PostgreSQL/Redis state and real Socket.IO server/client behavior exercised by those suites | Google OAuth, live browser UI, live Redis network outage timing |
| Web RTL | UI/cache/state/error behavior with mocked external boundaries | Real Leaflet, proxy, transport, provider or OAuth |
| Production Chromium | Browser layout/interaction and whichever real proxy/transport boundaries the scenario actually uses | Unmocked dependencies that the scenario intercepts or fixtures |
| Fixture/test session | Session-shaped behavior or persisted test-session resolution | Real Google consent, redirect, callback or account login |
| Intercepted Stadia tiles | Deterministic map rendering and visible attribution | Live provider access, authentication, licensing eligibility or quotas |
| Local ordered gates | Result for the recorded local snapshot and environment | PR CI or another commit |
| GitHub Actions run | CI result only for its recorded SHA/workflow run | Real OAuth/live provider unless explicitly added and evidenced |
| Coverage-enabled run | Coverage for the collected/instrumented files in that run | Any arbitrary quota without a recorded coverage command |

Real Google OAuth is `NOT_RUN` unless a separate sanitized smoke records the configured origin/callback, account class, login/session/logout result and exact tested snapshot without exposing credentials or cookies. Automated auth tests and fixture sessions must never be relabelled as that smoke.

## Runtime ownership and safety

- Inspect existing worktrees, containers and listeners before starting services. Stop on an ownership collision; never stop, rebuild or reuse another worktree's runtime as evidence.
- `pnpm services:test:up` owns Compose project `wolfpack-test`, PostgreSQL `127.0.0.1:55431`, Redis `127.0.0.1:56381`, and tmpfs-backed service data for that run.
- `pnpm stack:up` owns Compose project `wolfpack` and publishes only nginx at `127.0.0.1:8081`. Use it only when the project/port is free and assigned to the current run.
- `pnpm test:e2e` verifies the production origin and owns only its dedicated realtime defaults: internal fixture/web ports `4108`/`3108`, loopback proxy `127.0.0.1:18081`, containers `wolfpack-e2e-realtime-fixture` / `-web` / `-proxy`, and network `wolfpack-e2e-realtime`. Override the matching `ROOM_REALTIME_*` ports/names/network together for an isolated worktree. Existing proxy listeners, containers or networks are collisions, never reusable evidence. Fixture/web ports are not published to the host.
- Preserve the production `postgres-data` volume. Stop owned services with `pnpm stack:stop` and `pnpm services:test:stop`; never use `down --volumes`, database reset, Redis `FLUSH*`, pruning, or broad wildcard cleanup.
- Test fixtures must use unique/scoped identifiers. Delete only exact task-owned rows, keys, containers, processes, reports and traces. Never clean another worktree's resources.
- Automated browser tests must retain deterministic Stadia interception. Do not introduce live provider traffic into the standard suite.
- Do not print or retain credentials, OAuth tokens, cookies, real environment values or session files in logs, screenshots, traces or reports.

## Evidence and failure handling

Record the tested base/HEAD, branch/worktree, dirty files, timestamp, runtime versions, service identifiers, exact command, exit status, collected suites/tests and sanitized artifacts. Inspect collected files and counts rather than relying only on a zero exit code.

No empty-suite success, `--passWithNoTests`, broad skips, error suppression, weakened assertions or imported historical output may be used to get green results. Verify that integration tests are collected despite ignore rules and that every Playwright file receives its required runtime. Coverage claims require a coverage-enabled command; the standard gates do not establish a coverage percentage.

A failed gate remains `FAIL` or `BLOCKED` until the exact cause is corrected and the affected sequence reruns. A pinned Docker build may diagnose a host-only build problem but does not silently convert the required host `pnpm build` command to PASS. Historical task evidence may guide diagnosis but cannot replace a failed integrated command.

Use [the QA template](templates/QA.md) for task evidence. Keep implementer self-check, independent review, local gates, PR CI, real services, fixtures, provider smokes and real OAuth explicitly distinct.
