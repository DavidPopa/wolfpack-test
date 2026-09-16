# Map Chat foundation

This repository currently contains the runnable foundation only: a Next.js 16 health page, an Express 5 infrastructure API, a browser-safe shared contract, an empty Socket.IO 4 transport, PostgreSQL 17, Redis 7.4, nginx, and ordered tests. Authentication, rooms, messages, maps, rate limits, and product realtime events are intentionally not implemented yet.

## Pinned runtime and install

Use Node `24.21.0` and pnpm `11.24.0` without changing a machine-wide default. `.node-version` and `.nvmrc` contain the Node pin. If a runtime manager is unavailable, download the official matching Node archive into an ignored task-local directory and prepend its `bin` directory to `PATH`.

```sh
node --version
pnpm --version
pnpm install --frozen-lockfile
```

External direct dependencies are exact pins—no caret, tilde, or floating `latest` specifiers. Prisma CLI, client, and PostgreSQL adapter are aligned at `7.10.0`; generation remains deferred because there are no approved domain models. pnpm permits lifecycle builds only for reviewed pinned tooling that needs setup or native binaries: Prisma client/engines/CLI, SWC, esbuild/tsx, Tailwind's Parcel watcher, and the ESLint resolver. Installation has no `prepare` script and does not change Git configuration.

## Local development and production stack

Foundation development deliberately reuses the isolated test PostgreSQL/Redis pair; it never falls back to a developer database. Start those services, then start the API on `4000` and Next on `3000`:

```sh
pnpm services:test:up
pnpm dev
```

Open `http://127.0.0.1:3000`. In development only, Next rewrites same-origin `/api/*` requests to Express on `127.0.0.1:4000`; production continues to use nginx. `pnpm dev` supplies the dummy connection values recorded in `.env.example` and fails clearly when the isolated services are unavailable. Development mode is not production E2E proof. Stop its dependencies with `pnpm services:test:stop` after stopping the dev process.

If either application port is already owned, choose isolated alternatives without stopping that process, for example `PORT=4100 WEB_PORT=3100 pnpm dev`, then open the selected web port. The development rewrite follows the selected API `PORT`.

The production stack is isolated as Compose project `mapchat-foundation-001` and publishes only nginx at `127.0.0.1:8081`:

```sh
pnpm stack:up
curl http://127.0.0.1:8081/api/health
curl http://127.0.0.1:8081/api/ready
pnpm stack:stop
```

`stack:stop` stops only this project's services and preserves the named PostgreSQL volume. Restart with `pnpm stack:up`. Do not use `down --volumes`, pruning, or a developer database. Images are pinned by tag and multi-platform digest: Node `24.21.0-bookworm-slim`, PostgreSQL `17.8-bookworm`, Redis `7.4.11-bookworm`, and stable nginx `1.30.4-alpine`. App image stages run as the non-root `node` user.

## Ordered verification

Start the isolated test PostgreSQL/Redis pair first. It uses `127.0.0.1:55431`, database `mapchat_foundation_test`, `127.0.0.1:56381`, and keys under `foundation:task001:`. Integration cleanup deletes only the exact generated Redis key and rolls back its SQL fixture.

```sh
pnpm services:test:up
pnpm db:validate
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

Prisma validation intentionally has no generator, models, migrations, or ORM CRUD claim; those await the approved domain schema. E2E injects the real Socket.IO client into Chromium as a test-only harness and proves polling plus forced WebSocket through nginx.

For the production-volume check, use a unique `foundation_task001_*` temporary table directly through `docker compose -p mapchat-foundation-001 exec -T postgres psql`, insert one dummy row, stop/start with the scripts above, verify the row, then drop only that fixture table. Never remove the volume.

## Hooks

`.husky/pre-commit` invokes `pnpm hooks:check`, which stops on the first failure in this order: lint, types, API unit, API integration, web Jest. The integration gate fails clearly when the isolated services are unavailable. These working-tree checks do not prove a different partially staged snapshot.

Husky is configured but deliberately not activated by installation. Only the developer should run:

```sh
pnpm hooks:install
```

The project-local Codex `PreToolUse` guard and harmless fixtures live under `.codex/`. Project hooks run only after the current definition is reviewed and trusted in Codex; see `.codex/README.md`. Fixtures do not prove trust or live tool routing, and the guard is defense in depth rather than a complete security boundary.

## CI and current limits

PR CI uses a frozen install, isolated services, the ordered gates, production Compose, Chromium, tooling fixtures, and sanitized failure artifacts. It does not use `pull_request_target`, publish images, change branch protection, or claim a pass until GitHub actually runs it. Google OAuth/provider verification, auth fixtures, maps, chat behavior, domain persistence, rate limits, deployment, and cost research are outside this foundation task.
