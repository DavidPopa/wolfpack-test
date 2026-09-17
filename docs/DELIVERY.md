# Delivery report

Status: final integrated local QA **PASS — developer-accepted local build limitation** on stacked snapshot `6e0cf86f42feb47a14638b08fa23a7635c983d88`; PR CI, deployment, real Google OAuth and live Stadia are not yet complete. The exact host `pnpm build` remains **BLOCKED**, not PASS, by the local Turbopack `EPERM` condition and must pass in CI before merge.

Date: 2026-09-17.

## Delivered product

Map Chat now implements the assessment's public rooms/map/chat slice:

- guest-readable persisted room pins and stable chronological message history;
- Google-only authenticated room and message writes with server-derived identity;
- PostgreSQL-backed idempotency for sequential and concurrent retries;
- Redis-backed atomic rate limits for both write types, with fail-closed writes;
- optimistic room and message attempts with targeted rollback/retry;
- created-only `room.created` and room-scoped `message.created` delivery on one Socket.IO server/client lifecycle;
- HTTP/socket deduplication in either arrival order and complete forward catch-up after reconnect;
- responsive desktop/mobile map and conversation layout with reader-controlled scrolling, keyboard access, focus ownership and semantic status/error output.

The intentionally excluded features remain private rooms, roles/profiles, moderation, room editing/deletion, search/geolocation, other auth providers, message editing/deletion, attachments, reactions, threads, presence, typing indicators, read receipts, offline sending, push notifications, queues, a message cache and horizontal scaling.

## Architecture and important tradeoffs

| Area | Implemented decision | Tradeoff |
| --- | --- | --- |
| Browser/API boundary | One nginx origin routes UI to Next.js and `/api` plus `/socket.io` to Express. | Simple cookie/CORS/WebSocket behavior; one API instance and no horizontal scaling. |
| Persistence | PostgreSQL owns rooms, messages, Better Auth data, uniqueness and stable tuple ordering. | Durable and race-safe, but deployment needs migrations, backups and connection management. |
| Rate limiting | Redis performs one atomic expiring counter per hashed identity/action. | Fast and shared; protected writes fail closed when Redis is unavailable. |
| Idempotency | Client UUID plus authenticated user uniqueness; payload/room mismatch conflicts. | Safe retries and concurrent recovery; IDs must remain stable for a retry and new for an intentional replacement. |
| Realtime | Socket.IO broadcasts only after persistence; history remains authoritative. | Connected clients get low latency, while disconnects require paginated HTTP catch-up. |
| Client state | TanStack Query owns canonical server data; separate React/query state owns selection, drafts and optimistic attempts. | Prevents invalid optimistic objects and stale snapshot rollback, at the cost of explicit reconciliation logic. |
| Pagination | Opaque canonical `(createdAt, id)` cursors match the database index. | Stable equal-timestamp traversal; cursors are intentionally server-owned and non-editable. |
| Map | Leaflet with Stadia-hosted Stamen Watercolor and exact attribution. | Matches the assessment; public/commercial use needs domain authentication and licensing review. |
| Automated browser proof | Real Chromium/Socket.IO with deterministic fixture HTTP/session/data and intercepted tiles. | Repeatable and secret-free, but not proof of PostgreSQL, Redis, Google OAuth or live Stadia in that scenario. |

## Evidence status

| Boundary | Status on this delivery snapshot | Evidence and limitation |
| --- | --- | --- |
| Phase 004 tasks 001–007 focused implementation/QA/review | PASS on their recorded predecessor snapshots | Real PostgreSQL/Redis and Node Socket.IO were used for API tasks; web races used RTL mocks; tasks 006–007 used production-web Chromium with fixture APIs. Each was same-agent QA/review, not an independent reviewer. |
| Task-008 documentation/static gates | PASS on the uncommitted delivery delta | Relative links, repository paths, root commands and 34 documented environment keys were audited; secret scan, `git diff --check`, lint and TypeScript passed. Host Node was `26.7.0`, not the pinned `24.21.0`. |
| Integrated local QA on `6e0cf86` plus this delivery delta | PASS — developer-accepted local build limitation | API unit passed 97/97, API integration passed 35/35 with real PostgreSQL/Redis, and web RTL passed 99/99. The production Docker build, proxy health/readiness, unfiltered E2E 10/10, tooling 20/20 and hooks all passed. The exact host `pnpm build` remains BLOCKED by the environment-specific Turbopack `EPERM`; it was not renamed PASS. |
| Production Chromium | PASS through the production Compose proxy | The root unfiltered gate passed all 10 tests: 9 production tests plus the dedicated two-context realtime test. All 5 `map.spec.ts` scenarios passed, including the strict selected-room history fixture/request and semantically scoped mobile Google action. |
| GitHub Actions for the final commit | NOT_RUN | No final task-008 commit/PR SHA exists yet. |
| Real Google OAuth login/session/logout | NOT_RUN | Automated fixture and persisted-session tests are explicitly not provider consent/callback evidence. |
| Live Stadia browser access/domain authentication | NOT_RUN | Standard Chromium intercepts tile traffic; provider licensing/configuration is documented in [MAP.md](MAP.md). |
| Deployment/staging production smoke | NOT_RUN | No infrastructure was provisioned and no deployment is claimed. |

No coverage percentage is claimed because the standard gates do not run a coverage command.

## Known limitations and remaining risks

1. The exact host `pnpm build` is locally BLOCKED by an environment-specific Turbopack internal-listener `EPERM`, including with a checksum-verified Node `24.21.0` runtime. The pinned-Node Docker production build passed and was accepted for local QA only. CI must rerun and pass exact `pnpm build` before merge; a CI reproduction blocks integration and requires a bounded tooling investigation.
2. Real Google OAuth still needs a sanitized manual smoke with developer-supplied credentials, exact origin/callback registration, personal or Workspace account login, persistent session and logout. Credentials/cookies must never enter logs or reports.
3. Live Stadia remains untested. A public preview needs domain authentication, visible attribution and a licensing/plan decision; standard automation must keep intercepting provider requests.
4. The architecture deliberately targets one API instance. Multi-instance Socket.IO fan-out, distributed presence and horizontal scaling are not implemented.
5. Redis failure rejects writes by design. Product messaging supports retry, but there is no queue/offline write fallback. Real Redis proves positive and expiry behavior; outage mapping uses controlled atomic-command rejection rather than live network-loss timing.
6. Host checks ran on Node `26.7.0` with an engine warning; production Docker builds used the pinned Node `24.21.0`. The diagnostic pinned host build encountered the same environment-specific `EPERM`. CI remains the required pinned Linux host proof.
7. Accessibility evidence includes deterministic RTL and targeted Chromium behavior, not a full manual screen-reader audit.

## Staging and production estimates

These are planning estimates, not deployed resources or quotes. They assume one region, modest assessment/demo traffic, the current single-API architecture, Docker-capable hosting, managed PostgreSQL and a Redis-compatible managed key-value service. Labor excludes feature changes and security/compliance certification.

Pricing references were checked on 2026-09-17. Render bills workspace, compute and metered usage separately, with database storage and bandwidth priced independently; exact service/database/key-value plan prices must be confirmed in its current calculator before purchase ([Render pricing](https://render.com/pricing), [service types](https://render.com/docs/service-types), [Key Value](https://render.com/docs/key-value)). Stadia's current Starter plan is listed at $20/month with commercial use and 1,000,000 credits; its free plan is non-commercial only ([Stadia pricing](https://stadiamaps.com/pricing), [authentication](https://docs.stadiamaps.com/authentication/)).

### Staging

- Topology: one small Docker host or two small app services, managed PostgreSQL, smallest Redis-compatible plan, TLS/custom domain, retained logs and daily database backups.
- Expected effort: 2–3 engineer-days for infrastructure definition, secrets, migrations, health checks, OAuth callback/domain setup, Stadia domain registration, smoke tests and rollback notes.
- Expected recurring infrastructure: roughly **US$40–120/month**, plus domain registration and usage overages. The low end assumes one small host/shared services; the high end assumes separate managed app/data services and paid map access.
- Operational allowance: 2–4 hours/month for dependency/runtime patches, backup checks, alert review and access rotation.

### Small production launch

- Topology: at least two application instances behind managed TLS/load balancing, managed PostgreSQL with point-in-time recovery, managed Redis-compatible key value, centralized logs/alerts and off-site backup verification. The current Socket.IO design still requires one effective API instance unless sticky routing plus a shared adapter is separately designed.
- Expected effort: 5–8 engineer-days for provider-specific infrastructure, zero-downtime migration/rollback procedures, secret rotation, monitoring/alerts, restore drill, OAuth/Stadia production setup, performance checks and runbooks.
- Expected recurring infrastructure: roughly **US$180–500/month** for a small non-HA launch, plus domain, bandwidth/log retention and at least the applicable Stadia commercial plan. High availability, larger retention or compliance requirements can raise this substantially.
- Operational allowance: 1–2 engineer-days/month for upgrades, incident/backup drills, cost review and security maintenance.

Before approving either environment, measure expected concurrent sockets, monthly map tiles, database size/write rate, Redis memory/key churn, build frequency, log volume, recovery objectives and availability target. Reprice against the chosen region/provider and obtain a fresh map-license review.

## Final acceptance path

1. Commit and publish only the reviewed final-delivery scope after developer approval.
2. Run GitHub Actions for that exact SHA. Exact `pnpm build` must pass before merge; the local Docker build does not replace this CI requirement.
3. Keep real Google OAuth, live Stadia and deployment explicitly `NOT_RUN` unless separately authorized sanitized smokes are performed.
4. Merge only after required CI and PR review succeed; then decide any staging/deployment work separately.
