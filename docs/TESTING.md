# Testing

Commands below are the foundation's proposed contract, not installed or executed tooling. Record actual commands/versions once implemented; update callers if names change.

## Ordered gates

| Order | Intended command | Checks |
| --- | --- | --- |
| 1 | `pnpm lint` | ESLint, check-only |
| 2 | `pnpm typecheck` | TypeScript |
| 3a | `pnpm test:api:unit` | Backend Jest unit suites |
| 3b | `pnpm test:api:integration` | Backend Jest with isolated PostgreSQL/Redis |
| 4 | `pnpm test:web` | Frontend Jest + React Testing Library |
| 5 | `pnpm build` | Production API/web/shared builds |
| 6 | `pnpm test:e2e` | Playwright Chromium through the production proxy |

Resolve a failed gate before proceeding. Focused development checks do not replace handoff gates. Husky runs gates 1–4; PR CI and final integrated verification run all gates. Docs-only changes may use justified N/A; missing required feature tests are not N/A.

## Test design

- **Backend:** explicitly collect unit and integration suites. Real integration tests cover migrations/constraints, forged or missing identity, invalid inputs, concurrent identical/conflicting retries, stable pagination, Redis rate-limit expiry/outage and persistence-before-event behavior.
- **Frontend:** use semantic queries and realistic interactions; await observable results rather than sleeps. Reset query clients/handlers between tests. Cover pending/success/failure/retry, targeted rollback with concurrent updates, event/HTTP order, duplicate events, stale selection/history and failed draft preservation.
- **Chromium:** run the production app through its proxy with known readiness and isolated resources; do not silently reuse an unrelated dev server. Exercise real map click/drag/marker selection, reload persistence, mobile/keyboard flows, and two independent contexts for room isolation, delivery and reconnect across multiple history pages.
- **Auth:** automated fixture sessions test app behavior, not Google integration. Record real Google login/logout/session persistence separately; missing provider access is BLOCKED. Fixtures must not bypass production auth.
- Mock only appropriate boundaries. Component/map mocks are not browser or transport proof. Put unsupported async server-component behavior into E2E; keep regression checks capable of failing on the original bug.

## Evidence and safety

Record the tested base/HEAD and dirty files, timestamp, exact command/scenario, environment, exit status, collected test counts and sanitized output/artifact. Use the [QA template](templates/QA.md); keep local results distinct from remote CI and self-review distinct from independent review.

No empty-suite success, `--passWithNoTests`, broad skips, error suppression or weakened assertions to get green results. Verify integration collection despite ignore rules. Coverage claims require a coverage-enabled run; no imported arbitrary quota.

Document service startup/migrations/test-data setup; never reset developer databases, clear shared Redis or delete unrelated volumes. Check-only commands must not format or stage changes. Redact secrets and session data from screenshots/traces. After fixes or integration, rerun affected gates; final submission needs the complete integrated suite.

Setup references: [Next.js Jest](https://nextjs.org/docs/app/guides/testing/jest), [React Testing Library](https://testing-library.com/docs/react-testing-library/intro/), [Jest](https://jestjs.io/docs/getting-started), [Playwright](https://playwright.dev/docs/intro).
