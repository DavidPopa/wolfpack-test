# Map Chat

Map Chat is a full-stack application created for the Wolfpack Digital developer assessment. The current Phase 003 implementation delivers the room-and-map slice: visitors can load persisted public room pins, select a room or draft a location, and preserve validated selection state through an authentication return. Google-authenticated users can explicitly create rooms with server-derived identity, PostgreSQL idempotency, Redis rate limiting, optimistic feedback, and targeted retry behavior.

Newly persisted rooms are delivered through Socket.IO on the existing same-origin proxy. The browser reconciles HTTP and socket results by stable room/request identity, avoids duplicate pins in either arrival order, retains unrelated optimistic attempts, and refreshes missed rooms after reconnect without replacing a newer selection. The responsive Leaflet map uses the approved Stadia Maps-hosted Stamen Watercolor source and visible attribution documented in [docs/MAP.md](docs/MAP.md).

## Implemented through Phase 003

- Public `GET /api/rooms` responses expose only browser-safe pin fields in stable creation order.
- Persisted pins, keyboard/mouse room selection, bounded empty-map drafts, URL restoration, responsive panels, and explicit post-auth resume behavior.
- Protected `POST /api/rooms` creation with server-session identity, strict coordinates and UUID request IDs, automatic titles, PostgreSQL uniqueness, and canonical idempotent replay.
- Atomic Redis write-rate limiting with bounded, hashed keys; protected writes fail closed when the limiter is unavailable while public reads remain available.
- Separate optimistic attempts with stable retry IDs, classified failures, targeted rollback, and late-result selection protection.
- Strict `room.created` delivery only for newly persisted rooms, plus client deduplication, listener cleanup, connection status, and reconnect recovery.
- Google-only Better Auth session lifecycle; no local password provider.

## Current product boundary

Message/chat functionality is not implemented yet. The Room and Message tables exist, but public message history, pagination, message sending/composer UI, message write rate limiting, room subscriptions, and message realtime delivery remain Phase 004 work. The selected-room panel intentionally renders a room shell without conversations. Do not treat room realtime as chat realtime.

## Technology

- **Frontend:** Next.js, TypeScript, Tailwind CSS, shadcn/ui, TanStack Query
- **Backend:** Node.js, Express, Socket.IO, Better Auth
- **Data:** PostgreSQL, Prisma 7, Redis
- **Map:** Leaflet
- **Testing:** Jest, React Testing Library, Playwright with Chromium
- **Tooling:** pnpm workspaces, Docker Compose, ESLint, Husky, GitHub Actions

## Project structure

```text
apps/
  web/          Next.js application
  api/          Express API
packages/
  contracts/    Shared API and realtime contracts
docs/           Product and engineering documentation
```

## Pinned runtime and install

Use Node `24.21.0` and pnpm `11.24.0` without changing a machine-wide default. `.node-version` and `.nvmrc` contain the Node pin. If a runtime manager is unavailable, download the official matching Node archive into an ignored task-local directory and prepend its `bin` directory to `PATH`.

```sh
node --version
pnpm --version
pnpm install --frozen-lockfile
```

External direct dependencies are exact pins—no caret, tilde, or floating `latest` specifiers. Prisma CLI, client, and PostgreSQL adapter are aligned at `7.10.0`; Better Auth and its Prisma adapter are aligned at `1.7.5`. pnpm permits lifecycle builds only for reviewed pinned tooling that needs setup or native binaries: Prisma client/engines/CLI, SWC, esbuild/tsx, Tailwind's Parcel watcher, and the ESLint resolver. Installation has no `prepare` script and does not change Git configuration.

## Local development and production stack

Local development deliberately reuses the isolated test PostgreSQL/Redis pair; it never falls back to a developer database. Start those services, then start the API on `4000` and Next on `3000`:

```sh
pnpm services:test:up
pnpm dev
```

Open `http://127.0.0.1:3000`. `pnpm dev` regenerates the ignored Prisma client before compiling or starting either application, supplies the dummy connection values recorded in `.env.example`, and fails clearly when the isolated services are unavailable. In development only, Next rewrites same-origin `/api/*` requests to Express on `127.0.0.1:4000`; production continues to use nginx. Development mode is not production E2E proof. Stop its dependencies with `pnpm services:test:stop` after stopping the dev process.

If either application port is already owned, choose isolated alternatives without stopping that process, for example `PORT=4100 WEB_PORT=3100 pnpm dev`, then open the selected web port. The development rewrite follows the selected API `PORT`.

The production stack is isolated as Compose project `wolfpack` and publishes only nginx at `127.0.0.1:8081`:

```sh
pnpm stack:up
curl http://127.0.0.1:8081/api/health
curl http://127.0.0.1:8081/api/ready
pnpm stack:stop
```

`stack:stop` stops only this project's services and preserves the named PostgreSQL volume. Restart with `pnpm stack:up`. Do not use `down --volumes`, pruning, or a developer database. Images are pinned by tag and multi-platform digest: Node `24.21.0-bookworm-slim`, PostgreSQL `17.8-bookworm`, Redis `7.4.11-bookworm`, and stable nginx `1.30.4-alpine`. App image stages run as the non-root `node` user.

Before starting either repository Compose project, inspect existing containers and ports. Do not rebuild, stop, or reuse a runtime owned by another worktree. The production proxy is the only published production port and routes `/api/*` and `/socket.io/*` to Express and all other traffic to Next.js.

## Map provider and attribution

The browser pins Leaflet `1.9.4` and the approved Stadia Maps-hosted Stamen Watercolor raster source with maximum zoom `16`. The map must visibly retain linked attribution for **Stadia Maps**, **Stamen Design**, **OpenStreetMap**, and Leaflet. [docs/MAP.md](docs/MAP.md) is the durable source of truth for the exact tile template, attribution, licensing and configuration decision.

The approved use is an evaluation/non-commercial proof of concept. A public preview requires Stadia domain authentication; commercial use requires a fresh licensing review and an active paid plan. No browser API key belongs in `NEXT_PUBLIC_*`, Git, logs, screenshots, or client bundles. Automated Chromium tests intercept Stadia tile requests with deterministic neutral tiles, so they prove Leaflet integration and visible attribution—not live provider availability or domain authentication. A live-provider smoke is separate and must be explicitly configured.

## Google authentication configuration

The API requires `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `BETTER_AUTH_TRUSTED_ORIGINS`, `GOOGLE_CLIENT_ID`, and `GOOGLE_CLIENT_SECRET`. `BETTER_AUTH_URL` must be the browser-visible origin with no path or trailing slash. `BETTER_AUTH_TRUSTED_ORIGINS` is a comma-separated list of exact origins and must include `BETTER_AUTH_URL`. The committed `.env.example`, development command, and Compose defaults contain dummy values only; they make configuration and non-provider checks runnable but cannot complete Google OAuth.

Better Auth is exposed through the same origin as the web application. Register the exact Google redirect URI by appending `/api/auth/callback/google` to the browser-visible origin:

- Local `pnpm dev`: `http://127.0.0.1:3000/api/auth/callback/google` (or the selected `WEB_PORT`). Next proxies `/api/*` to Express.
- Local production Compose: `http://127.0.0.1:8081/api/auth/callback/google`. nginx proxies `/api/*` to Express.
- Deployment: `https://your-domain.example/api/auth/callback/google`. Deployment must use HTTPS and set both `BETTER_AUTH_URL` and trusted origins to the deployed origin.

Google personal and Workspace accounts are accepted; no hosted-domain restriction is configured. Email/password sign-up and sign-in are disabled. Replace the dummy Google values and auth secret through local, uncommitted environment configuration before a real-provider smoke. Automated configuration, fixture-session and persisted-session tests do not prove the Google redirect, callback, login or logout flow. Real Google OAuth remains **NOT_RUN** unless a separately recorded smoke uses developer-supplied credentials.

The Next.js app has one Better Auth React client in `apps/web/lib/auth-client.ts`. It deliberately omits an absolute `baseURL` and uses `/api/auth`, so browser session and sign-in/sign-out calls stay on the application origin through the existing development rewrite or production nginx proxy. `useAuthSession` is a thin projection of Better Auth's reactive session hook into explicit loading, signed-out, signed-in and retryable error states; it does not copy auth state into TanStack Query. Google sign-in passes the current room/draft URL through `getSafeReturnTarget`, which keeps only same-origin path, query and hash state. Returning from auth restores a valid selection or draft but never creates a room without an explicit signed-in action.

The web shell renders the reactive loading, guest, session-error and authenticated states from that single session boundary. It offers Google sign-in only, displays the signed-in user's name without exposing their email, and relies on Better Auth's reactive session update after logout. Focused web tests mock the Better Auth client boundary and cover the visible states, keyboard actions, failure recovery and safe return target. Production Chromium covers the guest shell and same-origin proxy session request without navigating to Google. These automated checks do not prove real Google OAuth; that remains a separate sanitized manual smoke when credentials are supplied.

## Server-side session boundary and auth tests

Protected API work must use the typed server-side resolver in `apps/api/src/auth.ts`. It passes only the incoming request headers to Better Auth, forces an authoritative database lookup instead of trusting cookie cache, avoids a hidden session refresh whose cookie could not be forwarded from a protected endpoint, and returns only the verified user ID. Request bodies, identity-like headers, bearer values and environment variables cannot activate a fixture identity. The production runtime always constructs this resolver and the Express handler from the same real Better Auth instance.

Unit tests can replace the auth boundary only when calling the application factory directly. The real PostgreSQL integration creates a uniquely prefixed user and session with Better Auth's test-only construction plugin, which registers no HTTP endpoints, and then verifies that the normal production boundary resolves the cookie. It also proves that an untrusted origin cannot log out the session, a configured same-origin request deletes the persisted session and clears the cookie, and cleanup removes only the generated user/account/session rows. These seeded fixtures prove the database/session lifecycle only; they do not contact Google or prove real Google OAuth.

## Ordered verification

Start the isolated test PostgreSQL/Redis pair first. It uses `127.0.0.1:55431`, database `mapchat_foundation_test`, `127.0.0.1:56381`, and repository-owned Redis prefixes rooted at `foundation:task001:`. Integration suites use scoped SQL/auth/room fixtures and exact Redis keys; cleanup must never reset the database or flush Redis.

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

`services:test:up` deploys the committed migration to the isolated test database. Use `pnpm db:migrate:test:status` to inspect it. Creating a new migration is an explicit developer action with `pnpm db:migrate:test:create --name <name>`; production commands require an explicitly supplied `DATABASE_URL`, for example `DATABASE_URL=postgresql://... pnpm db:migrate:deploy` or `DATABASE_URL=postgresql://... pnpm db:migrate:status`. Never run a reset against a persistent database.

`pnpm test:e2e` validates that every `tests/e2e/*.spec.ts` file belongs to exactly one named Chromium project. The production project runs the foundation and map scenarios against the already-started production proxy on `127.0.0.1:8081`. The realtime project runs `tests/e2e/room-realtime.spec.ts` against a task-owned origin: the runner starts the in-memory API/session fixture, a second container from the exact image ID currently tagged `wolfpack-web:latest`, and the dedicated nginx proxy on one owned Docker bridge network. Stable network aliases carry all fixture/web/proxy traffic; no host gateway is used, and only the proxy publishes `127.0.0.1:18081`. Defaults are internal fixture/web ports `4108`/`3108`, containers `wolfpack-e2e-realtime-fixture`/`-web`/`-proxy`, and network `wolfpack-e2e-realtime`; corresponding `ROOM_REALTIME_*` variables allow isolated worktree values. Occupied proxy ports, container names or network names fail before mutation and are never reused.

Foundation/map scenarios exercise the production web/proxy boundary; map scenarios intercept room/session responses where declared and every current browser scenario intercepts Stadia tiles. The targeted two-context realtime scenario uses the fixture in `tests/e2e/room-realtime-fixture.mjs` and proxy template in `tests/e2e/room-realtime.nginx.conf`. It proves production-browser Socket.IO transport and client reconciliation, not PostgreSQL, Redis, Better Auth, or Google. The root runner propagates either project failure, terminates an in-flight owned child process group on interruption, and then cleans its exact-ID containers/network in `finally`; it never stops the separately owned `wolfpack` stack or removes a volume. See [docs/TESTING.md](docs/TESTING.md) for evidence boundaries.

The generated Prisma client is intentionally not committed. Root `dev`, `typecheck`, API unit/integration test, and `build` commands each regenerate it before consuming API runtime code, so they remain reproducible after a clean install. The explicit `pnpm db:generate` step above keeps generation visible as setup evidence; CI and Docker also retain their own generation steps.

For the production-volume check, use a unique `foundation_task001_*` temporary table directly through `docker compose exec -T postgres psql`, insert one dummy row, stop/start with the scripts above, verify the row, then drop only that fixture table. Never remove the volume.

## Hooks

`.husky/pre-commit` invokes `pnpm hooks:check`, which stops on the first failure in this order: lint, types, API unit, API integration, web Jest. The root typecheck and API test commands regenerate the Prisma client, so the hook does not depend on ignored output from an earlier command. The integration gate fails clearly when the isolated services are unavailable. These working-tree checks do not prove a different partially staged snapshot.

Husky is configured but deliberately not activated by installation. Only the developer should run:

```sh
pnpm hooks:install
```

The project-local Codex `PreToolUse` guard and harmless fixtures live under `.codex/`. Project hooks run only after the current definition is reviewed and trusted in Codex; see `.codex/README.md`. Fixtures do not prove trust or live tool routing, and the guard is defense in depth rather than a complete security boundary.

## Documentation

- [Technical PRD](docs/PRD.md)
- [Engineering notes](docs/ENGINEERING.md)
- [Testing strategy](docs/TESTING.md)
- [Agent workflow](AGENTS.md)

## CI and current limits

The committed PR workflow is configured for a frozen install, isolated migrated services, Prisma generation, the ordered gates, production Compose, Chromium, tooling fixtures, and sanitized failure artifacts. It does not use `pull_request_target`, publish images, or change branch protection. A workflow definition, historical task run, or local pass is not evidence that CI passed a particular commit; record the actual run URL and SHA separately.

Automated tests cover the room list/create contracts, real PostgreSQL room persistence/idempotency, real Redis limiter state/expiry, mocked client state and failure paths, production Leaflet interaction, and real Socket.IO transports within the boundaries described in [docs/TESTING.md](docs/TESTING.md). They do not prove real Google OAuth, live Stadia access, deployment, message/chat behavior, or a successful current PR run.
