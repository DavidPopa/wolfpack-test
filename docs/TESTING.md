# Testing

These commands are the implemented foundation contract. They cover infrastructure scaffolding only; later product tasks must add auth, map, room, message, rate-limit, pagination, optimistic-state and reconnect coverage.

## Ordered gates

| Order | Command | Foundation checks |
| --- | --- | --- |
| 1 | `pnpm lint` | ESLint, check-only |
| 2 | `pnpm typecheck` | TypeScript |
| 3a | `pnpm test:api:unit` | Backend Jest unit suites |
| 3b | `pnpm test:api:integration` | Backend Jest with isolated PostgreSQL/Redis |
| 4 | `pnpm test:web` | Frontend Jest + React Testing Library |
| 5 | `pnpm build` | Production API/web/shared builds |
| 6 | `pnpm test:e2e` | Playwright Chromium through the production proxy |

Run `pnpm services:test:up`, `pnpm db:validate`, `pnpm db:generate`, and `pnpm exec playwright install chromium` before the ordered gates. The explicit generation command records setup evidence, while root `dev`, `typecheck`, API unit/integration test, and `build` commands also regenerate the ignored client before consuming API runtime code. Test-service startup safely deploys committed migrations and the API integration command redeploys them idempotently before Jest. Husky reaches generation through its root typecheck and API test commands; CI and Docker retain dedicated generation steps. Resolve a failed gate before proceeding. Focused checks do not replace handoff gates. Husky runs gates 1–4; PR CI runs every gate plus `pnpm test:tooling` and the actual `pnpm hooks:check` entrypoint. Stop owned services with `pnpm stack:stop` and `pnpm services:test:stop`; both preserve data/volumes.

## Test design

- **Backend foundation:** unit tests cover config redaction, public health, bounded aggregated readiness, Prisma shutdown and JSON 404. Real isolated integration tests cover a rolled-back SQL roundtrip, the migrated auth/domain tables, foreign keys, idempotency constraints, cursor-order indexes, a namespaced Redis value/expiry/cleanup, and Socket.IO polling/WebSocket clients.
- **Frontend foundation:** RTL uses a fresh QueryClient, semantic queries and realistic keyboard interaction for loading, success, error and retry.
- **Chromium foundation:** Playwright runs only against `127.0.0.1:8081` after the owned production stack is healthy; it covers the page/control state, API, proxy JSON 404 and both Socket.IO transports.
- **Later product coverage:** auth, Google-provider behavior, map interactions, writes, domain migrations/constraints, pagination, optimistic reconciliation, rates and reconnect recovery remain outside this task and are not claimed.
- Mock only appropriate boundaries. Component/map mocks are not browser or transport proof. Put unsupported async server-component behavior into E2E; keep regression checks capable of failing on the original bug.

## Evidence and safety

Record the tested base/HEAD and dirty files, timestamp, exact command/scenario, environment, exit status, collected test counts and sanitized output/artifact. Use the [QA template](templates/QA.md); keep local results distinct from remote CI and self-review distinct from independent review.

No empty-suite success, `--passWithNoTests`, broad skips, error suppression or weakened assertions to get green results. Verify integration collection despite ignore rules. Coverage claims require a coverage-enabled run; no imported arbitrary quota.

Document service startup/migrations/test-data setup; never reset developer databases, clear shared Redis or delete unrelated volumes. Check-only commands must not format or stage changes. Redact secrets and session data from screenshots/traces. After fixes or integration, rerun affected gates; final submission needs the complete integrated suite.

Setup references: [Next.js Jest](https://nextjs.org/docs/app/guides/testing/jest), [React Testing Library](https://testing-library.com/docs/react-testing-library/intro/), [Jest](https://jestjs.io/docs/getting-started), [Playwright](https://playwright.dev/docs/intro).
