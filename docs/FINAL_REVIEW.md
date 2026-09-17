# Final assessment review

Status: **implementation evidence complete on code SHA `98f4a1e9dc2cec669c18ddb5ef76535366b83c52`; task-003 QA concluded `PASS`, and final re-review concluded `ready for final submission` after the authorized REVIEW003-1 correction. This documentation overlay remains uncommitted pending developer publication.**

Date: 2026-09-17.

This is the durable reviewer entrypoint for the Wolfpack Digital assessment and the approved [technical PRD](PRD.md). It consolidates the final code, local verification, real-provider smoke, clean bootstrap, GitHub CI, limitations and review dispositions without depending on the ignored local `SPRINTS` workspace.

## Submission state

| Item | Exact state |
| --- | --- |
| Final application baseline | `98f4a1e9dc2cec669c18ddb5ef76535366b83c52` on `main`; merge commit for [PR #4](https://github.com/DavidPopa/wolfpack-test/pull/4), merged 2026-09-17. |
| Baseline CI | [Actions run 35218401579](https://github.com/DavidPopa/wolfpack-test/actions/runs/35218401579), `push`, exact head SHA above. Attempt 1 failed; unchanged attempt 2 concluded `success`. |
| Documentation branch | `docs/final-submission`, created directly from the baseline SHA. The README/onboarding overlay and this report are currently uncommitted and unstaged; they are not covered by the baseline CI run. |
| Deployment | **NOT_RUN.** No staging or production environment was provisioned, and this report makes no deployment claim. |

The first CI attempt is not green: after the production-browser tests passed, the concurrent realtime scenario timed out after five seconds waiting for an initial marker (`expected 1`, `received 0`); tooling and hooks were consequently skipped. The unchanged failed-job rerun used the same SHA and passed the complete workflow in 4m25s (12:32:59Z–12:37:24Z), including frozen install, migrations, lint, TypeScript, API unit/integration, web Jest, exact `pnpm build`, production Compose, all E2E projects, tooling, hooks and volume-preserving cleanup.

## Delivered system and user journey

The browser reaches one nginx origin. nginx sends UI requests to Next.js and `/api/*` plus `/socket.io/*` to the Express application. Express owns Better Auth, validated room/message operations, PostgreSQL persistence, Redis write-rate limits and Socket.IO publication. PostgreSQL is authoritative; realtime delivery accelerates updates but never replaces history.

A visitor can browse persisted room pins, select a room and read paginated public history. Google sign-in unlocks room creation and message sending. Map clicks create optimistic room attempts; confirmed rooms replace only their matching attempt. Messages similarly remain pending until the server confirms them, retain targeted failures for retry and reconcile HTTP/socket delivery in either order. The selected-room Socket.IO subscription catches up over HTTP after reconnect. Desktop uses a map with a conversation rail; mobile reflows the same accessible controls and state.

Primary owners are:

- `apps/web/components/room-map.tsx` and `apps/web/components/message-*.tsx` for the map, selection, history, composer and accessible UI;
- `apps/web/lib/room-*.ts*` and `apps/web/lib/message-*.ts*` for server-state, optimistic and realtime reconciliation;
- `apps/api/src/auth.ts`, `apps/api/src/rooms/` and `apps/api/src/messages/` for session-derived writes, persistence and events;
- `apps/api/prisma/schema.prisma` for Better Auth, room and message persistence/indexes;
- `packages/contracts/src/` for browser-safe HTTP/realtime schemas;
- `compose.yaml` and `infra/nginx/default.conf` for the single-origin production topology.

## Assessment and PRD traceability

`PASS` below means the cited final evidence supports that exact boundary. A limitation remains explicit where evidence is narrower than the requirement.

| Requirement | Implemented source entrypoint | Evidence status and boundary |
| --- | --- | --- |
| GitHub source and technical PRD | Repository root; [PRD](PRD.md); [PR #4](https://github.com/DavidPopa/wolfpack-test/pull/4) | **PASS** for the merged application SHA. This final documentation delta is not yet committed or published. |
| Public rooms and map pins | `apps/api/src/rooms/`; `apps/web/components/room-map.tsx`; `packages/contracts/src/rooms.ts` | **PASS.** API unit/integration, RTL and production Chromium cover public listing, persisted pins, selection and exact public projection. |
| Click map to create a room | `room-map.tsx`; `apps/web/lib/room-create.ts`; rooms router/service/repository | **PASS.** Auth gating, optimistic saving/failure/retry, stable request identity, conflicts, concurrent replay and PostgreSQL uniqueness were exercised. Pin selection and dragging do not create another room. |
| Map appearance, controls and attribution | `apps/web/lib/map-provider.ts`; `room-map.tsx`; `apps/web/app/globals.css`; [map decision](MAP.md) | **PASS** for Leaflet interaction, Watercolor configuration and visible Leaflet/Stadia Maps/Stamen Design/OpenStreetMap attribution. Automated Chromium intercepts tiles; the separate live-localhost boundary is recorded below. |
| Google-only authentication and sessions | `apps/api/src/auth.ts`; `apps/web/lib/auth-*.ts*`; `apps/web/components/auth-panel.tsx`; Prisma auth models | **PASS** for a developer-designated personal Google account: real provider round trip after explicit logout, session reload persistence, protected-write gating and final logout. **NOT_RUN** for Google Workspace because no Workspace account was available. No fresh consent-screen claim is made. |
| Public history and authenticated messages | `apps/api/src/messages/`; `apps/web/lib/message-*.ts*`; message history/composer components | **PASS.** Real PostgreSQL integration covers privacy-safe cursor pagination and idempotent writes; RTL covers chronological display, pending/failed/sent state, targeted retry and late-result isolation. Real-provider smoke created no message, so it does not add a Google-backed send claim. |
| Realtime and reconnect recovery | API room/message event modules; web room/message realtime modules; `tests/e2e/room-realtime.spec.ts` | **PASS** within labelled layers. API integration uses real Node Socket.IO plus PostgreSQL; the two-context Chromium scenario uses real browser Socket.IO but fixture session/data, and covers ordering, isolation, deduplication and multi-page catch-up. |
| Persistence between sessions/restarts | Prisma schema/migration; repositories; `compose.yaml`; API Docker entrypoint | **PASS.** Clean bootstrap deployed the committed migration, observed migration-before-listen, and retained an exact synthetic marker across documented `stack:stop`/`stack:up` using `wolfpack_postgres-data`. |
| Responsive and accessible UX | `room-map.tsx`; message components; `globals.css` | **PASS** for deterministic RTL and targeted desktop/mobile Chromium: keyboard/focus ownership, semantic states/timestamps, reader-controlled scrolling, reflow and announcements. A full manual screen-reader audit remains **NOT_RUN**. |
| Local setup and dummy-safe configuration | [README](../README.md); [`.env.example`](../.env.example); root scripts; Compose files | **PASS.** A clean worktree used `pnpm install --frozen-lockfile`, committed dummy defaults, Prisma validate/generate/deploy/status, production health/readiness and persistent restart without a populated `.env` or lockfile change. Host Node was 26.7.0 rather than pinned 24.21.0; Docker and CI used 24.21.0. |
| Ordered tests, hooks and CI | [testing contract](TESTING.md); `.github/workflows/ci.yml`; root `package.json` | **PASS** for the exact merged SHA through CI attempt 2. Phase 004 local evidence separately passed API unit 97/97, API integration 35/35, web 99/99, production Compose/E2E 10/10, tooling 20/20 and hooks; its host `pnpm build` was blocked by local Turbopack `EPERM`, then exact `pnpm build` passed in Linux CI. |
| Infrastructure and cost estimate | [delivery report](DELIVERY.md#staging-and-production-estimates) | **PASS** as a planning deliverable only. The AWS estimate covers ECS/Fargate, ECR, ALB, RDS PostgreSQL, ElastiCache for Valkey, networking, secrets, observability, DNS/TLS, backups, map service, effort and operating assumptions; it is neither a quote nor deployment evidence. |
| Self-review with dispositions | Project rules in `AGENTS.md`; `.codex/skills/review/SKILL.md`; this report; [delivery report](DELIVERY.md) | **PASS.** The configured review was run against the integrated application and final documentation snapshot. Task-003 QA concluded `PASS`; REVIEW003-1 was resolved by correcting this report's validation status and checklist; final re-review concluded `ready for final submission`. The exact-SHA baseline CI does not cover this uncommitted documentation overlay. |

The assessment's optional realtime behavior is implemented. Private rooms, moderation, room/message editing or deletion, attachments, reactions, threads, presence, typing indicators, read receipts, offline sending, search/geolocation, additional auth providers, queues, message caching and horizontal scaling remain intentionally excluded by the PRD.

## Evidence boundaries

### Real OAuth and live map provider

- **Personal Google account: PASS.** The sanitized visible-browser smoke established a real provider initiation/callback, signed-in return, reload-persistent session, logout and protected-write gating. The browser profile already had Google authentication and a prior grant, so no new consent or account-picker screen is claimed. No identity, credential, cookie, code or token was retained.
- **Google Workspace account: NOT_RUN.** No Workspace account was available. Personal-account evidence is not generalized to this account class.
- **Live Stadia on localhost: PASS.** With cache disabled and no request interception, multiple Stadia-hosted Watercolor JPEG requests returned HTTP 200, no observed 401/429 occurred, map interaction worked and all required attribution remained visible.
- **Public-domain authentication, quota and commercial authorization: NOT_RUN.** Localhost access does not prove a public deployment. The approved use is evaluation/non-commercial proof of concept only. Any public preview needs Stadia domain authentication; commercial use needs a fresh licensing review and an active applicable paid plan. See [MAP.md](MAP.md).

The smoke retained one empty public room created through supported UI because room deletion is intentionally not implemented. It contains no reported private identity. Unsupported database cleanup was not attempted.

### Deterministic automation

Frontend unit/RTL tests mock browser boundaries. API integration uses real isolated PostgreSQL, Redis and Node Socket.IO, while controlled command rejection—not a live Redis network outage—proves the fail-closed error mapping. Production Chromium uses the actual built web/proxy; all Stadia requests are intercepted. Its realtime project uses real two-browser Socket.IO transport but `.invalid` fixture identity and in-memory fixture data. None of those substitutes for the real OAuth/live-provider smoke above.

Local evidence proves its recorded snapshot and environment. Only the successful attempt of run 35218401579 proves the complete GitHub workflow for the exact merged SHA; it does not cover this uncommitted documentation overlay.

## Review findings and remaining risks

| Finding | Final disposition | Remaining risk |
| --- | --- | --- |
| Late history retry could affect a newer room; foreign-room scroll anchor; stale near-bottom announcement | **Fixed** in Phase 004 with focused regressions and the final web/E2E suites. | None known within those scenarios. |
| Delivery report had stale pre-QA results; `.env.example` had one unused runner variable | **Fixed** in Phase 004; static, environment and secret audits passed. | None known. |
| Local host `pnpm build` hit Turbopack listener `EPERM` | **Resolved as an evidence gate, not by a source change:** the exact command passed on the merged SHA in pinned-Node Linux CI. | A future local host may reproduce the environment-specific restriction; CI remains authoritative for the merged SHA. |
| Better Auth receives no trusted client IP through the current nginx boundary, so its auth-endpoint limiter can fall back to a shared per-path bucket | **Deferred, low severity.** Validation scope did not authorize a proxy/auth correction. | Concurrent users may throttle one another; this is stricter availability behavior, not an auth bypass. A fix requires a bounded proxy/trust task and regression tests. |
| First CI attempt timed out during concurrent realtime initial readiness | **Deferred/monitor, low severity.** The failure history is retained; unchanged CI rerun and local E2E passed. | Intermittent false-negative CI may recur. Investigate deterministic readiness if it repeats rather than weakening the assertion. |
| Sanitized provider smoke has no retained screenshot/HAR; one empty room remains | **Accepted limitations.** Avoiding session artifacts protects privacy; unsupported deletion was not used. | External smoke is less independently replayable, and the synthetic public room remains in the preserved local volume. |

No finding was rejected. No unresolved critical, high or medium correctness finding is recorded. The recorded task QA/reviews are same-agent checks rather than an independent reviewer. Additional risks are the deliberate single-effective-API architecture, fail-closed writes during Redis failure, no full manual screen-reader audit, no coverage-percentage claim, no public-domain provider/OAuth deployment proof and no staging/production smoke.

## Delivery estimate boundary

The [delivery report](DELIVERY.md#staging-and-production-estimates) estimates an AWS staging environment in `eu-central-1` at 2–4 engineer-days and roughly US$100–250/month, and a small production launch at 5–10 engineer-days and roughly US$300–800/month, plus domain, traffic/log overages and applicable map licensing. The ranges assume on-demand pricing, modest traffic, ECS/Fargate containers, RDS PostgreSQL, ElastiCache for Valkey and the current single-effective-API design. They must be recalculated for the final account, usage, retention, recovery and availability requirements. No AWS resource was provisioned.

## Reviewer path

Prerequisites are Node `24.21.0`, pnpm `11.24.0`, Docker Compose and Playwright Chromium. Start from the final submitted documentation commit, confirm its application baseline descends from the reviewed code SHA above, and use only dummy-safe configuration unless separately validating OAuth:

```sh
git rev-parse HEAD
git status --short
node --version
pnpm --version
pnpm install --frozen-lockfile
pnpm services:test:up
pnpm db:validate
pnpm db:generate
pnpm db:migrate:test:status
pnpm lint
pnpm typecheck
pnpm test:api:unit
pnpm test:api:integration
pnpm test:web
pnpm build
pnpm stack:up
curl http://127.0.0.1:8081/api/health
curl http://127.0.0.1:8081/api/ready
pnpm test:e2e
pnpm test:tooling
pnpm hooks:check
pnpm stack:stop
pnpm services:test:stop
```

Preserve database and Redis state, the named PostgreSQL volume and resources owned by other worktrees. Real Google OAuth additionally needs a private secret and registered callback matching the browser-visible origin; dummy values cannot complete provider login. See the [README](../README.md) and [testing contract](TESTING.md) for setup, ownership and evidence details.

Submission checklist:

- [x] Review the complete documentation-only diff and confirm no credential, identity, generated output or unrelated root change entered it.
- [x] Task-003 QA concluded `PASS`; REVIEW003-1 was corrected and final re-review concluded `ready for final submission`.
- [ ] Commit/push only with explicit developer authorization, then require CI for that new documentation commit rather than reusing the baseline run.
- [ ] Confirm final repository links, images and the two onboarding discovery symlinks after checkout.
- [ ] Keep deployment, Workspace OAuth, public-domain Stadia/commercial approval, screen-reader audit and coverage percentage labelled `NOT_RUN` unless new evidence exists.

## Onboarding

For a direct tour, start with [Documentation and onboarding](ONBOARDING.md). In Codex, open `/skills` and choose `onboard-project` for a read-only reviewer/repository tour or `onboard-developer` for a role-aware full-stack, frontend, backend, QA or reviewer journey. Their canonical Map Chat-specific definitions are `.codex/skills/onboard-project/SKILL.md` and `.codex/skills/onboard-developer/SKILL.md`; `.agents/skills/` contains relative discovery symlinks to those folders. Both skills are bounded to onboarding and grant no install, runtime, source-edit, secret or Git authority.
