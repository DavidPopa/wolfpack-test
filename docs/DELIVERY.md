# Delivery report

Status: this report preserves the Phase 004 integrated-local snapshot and estimates. The subsequent [final assessment review](FINAL_REVIEW.md) records real personal-account OAuth and localhost Stadia smoke results, clean bootstrap, and exact-SHA GitHub CI for merged code SHA `98f4a1e9dc2cec669c18ddb5ef76535366b83c52`. Deployment remains **NOT_RUN**.

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
| Task-008 documentation/static gates | PASS on the reviewed delivery delta, subsequently published | Relative links, repository paths, root commands and 34 documented environment keys were audited; secret scan, `git diff --check`, lint and TypeScript passed. Host Node was `26.7.0`, not the pinned `24.21.0`. |
| Integrated local QA on `6e0cf86` plus this delivery delta | PASS — developer-accepted local build limitation | API unit passed 97/97, API integration passed 35/35 with real PostgreSQL/Redis, and web RTL passed 99/99. The production Docker build, proxy health/readiness, unfiltered E2E 10/10, tooling 20/20 and hooks all passed. The exact host `pnpm build` remains BLOCKED by the environment-specific Turbopack `EPERM`; it was not renamed PASS. |
| Production Chromium | PASS through the production Compose proxy | The root unfiltered gate passed all 10 tests: 9 production tests plus the dedicated two-context realtime test. All 5 `map.spec.ts` scenarios passed, including the strict selected-room history fixture/request and semantically scoped mobile Google action. |
| GitHub Actions | PASS for application and published final documentation | [Run 35218401579](https://github.com/DavidPopa/wolfpack-test/actions/runs/35218401579) attempt 1 failed the concurrent realtime marker wait; unchanged attempt 2 passed the complete workflow for application SHA `98f4a1e9dc2cec669c18ddb5ef76535366b83c52`. After the final-submission documentation was merged, [run 35232531984](https://github.com/DavidPopa/wolfpack-test/actions/runs/35232531984) passed on `main` at `f321090fb826ef1f05d2c0fa42e944bffe624f2a`. |
| Real Google OAuth login/session/logout | PASS — personal account; Workspace NOT_RUN | A sanitized visible-browser smoke proved real-provider return, reload-persistent session, logout and protected-write gating for a developer-designated personal account. No Workspace account was available, and automated fixtures remain excluded as OAuth proof. |
| Live Stadia browser access/domain authentication | PASS — localhost; public domain NOT_RUN | A cache-disabled, unintercepted localhost smoke observed Watercolor JPEG HTTP 200 responses and complete visible attribution. Public-domain authentication, quota and commercial authorization remain unproven; see [MAP.md](MAP.md). |
| Deployment/staging production smoke | NOT_RUN | No infrastructure was provisioned and no deployment is claimed. |

No coverage percentage is claimed because the standard gates do not run a coverage command.

## Known limitations and remaining risks

1. The exact host `pnpm build` remains locally BLOCKED by an environment-specific Turbopack internal-listener `EPERM`, including with a checksum-verified Node `24.21.0` runtime. The pinned-Node Docker production build passed locally, and exact `pnpm build` subsequently passed in Linux CI on the merged code SHA. This resolves the merge gate but not the local-host restriction.
2. Real Google OAuth passed a sanitized smoke for a developer-designated personal account with exact origin/callback registration, persistent session and logout. Workspace remains `NOT_RUN`. Credentials and cookies must never enter logs or reports.
3. Live Stadia passed an unintercepted localhost smoke. A public preview still needs domain authentication, visible attribution and a licensing/plan decision; standard automation must keep intercepting provider requests.
4. The architecture deliberately targets one API instance. Multi-instance Socket.IO fan-out, distributed presence and horizontal scaling are not implemented.
5. Redis failure rejects writes by design. Product messaging supports retry, but there is no queue/offline write fallback. Real Redis proves positive and expiry behavior; outage mapping uses controlled atomic-command rejection rather than live network-loss timing.
6. Host checks ran on Node `26.7.0` with an engine warning; production Docker builds used the pinned Node `24.21.0`. The diagnostic pinned host build encountered the same environment-specific `EPERM`; the merged SHA's pinned Linux CI supplied the exact successful host-build proof.
7. Accessibility evidence includes deterministic RTL and targeted Chromium behavior, not a full manual screen-reader audit.

## Staging and production estimates

These are planning estimates for AWS, not deployed resources or quotes. They assume `eu-central-1` (Frankfurt), on-demand pricing, 730 hours per month, modest assessment/small-launch traffic and no Free Tier credits, taxes, commitments or enterprise discounts. A fresh [AWS Pricing Calculator](https://calculator.aws/) estimate is required before provisioning.

The proposed topology keeps the existing application boundaries:

- Amazon ECS on AWS Fargate runs the Next.js web and Express API containers; Amazon ECR stores their images.
- An Application Load Balancer terminates HTTPS and preserves the same browser origin by routing `/api/*` and `/socket.io/*` to Express and other requests to Next.js. ACM supplies the integrated public certificate and Route 53 supplies DNS.
- Amazon RDS for PostgreSQL remains authoritative for rooms, messages and Better Auth data.
- Amazon ElastiCache for Valkey provides the Redis-compatible atomic rate-limit store. It does not become a message cache.
- Secrets Manager stores application credentials; CloudWatch receives logs, metrics and alarms. VPC networking, NAT/public IPv4, backups and data transfer are included as explicit cost drivers.

Pricing references were checked on 2026-09-17: [AWS Fargate](https://aws.amazon.com/fargate/pricing/), [Application Load Balancer](https://aws.amazon.com/elasticloadbalancing/pricing/), [RDS for PostgreSQL](https://aws.amazon.com/rds/postgresql/pricing/), [ElastiCache](https://aws.amazon.com/elasticache/pricing/), [VPC and NAT Gateway](https://aws.amazon.com/vpc/pricing/), [CloudWatch](https://aws.amazon.com/cloudwatch/pricing/), [Secrets Manager](https://aws.amazon.com/secrets-manager/pricing/), [ECR](https://aws.amazon.com/ecr/pricing/), [Route 53](https://aws.amazon.com/route53/pricing/) and [ACM](https://aws.amazon.com/certificate-manager/pricing/). AWS charges these services through different dimensions such as requested compute, instance hours, storage, requests, load-balancer capacity, log ingestion, public IPv4, NAT processing and data transfer; the ranges below are therefore intentionally conservative. Stadia's applicable commercial plan, domain registration and traffic overages remain separate ([Stadia pricing](https://stadiamaps.com/pricing), [authentication](https://docs.stadiamaps.com/authentication/)).

| Component | Chosen AWS service | Rationale | Staging estimate/month | Small production estimate/month |
| --- | --- | --- | ---: | ---: |
| Web and API compute | ECS on Fargate + ECR | Runs the existing containers without managing EC2 hosts; ECR keeps deployable images in-region. | US$20–45 | US$60–130 |
| HTTPS and same-origin routing | Application Load Balancer + ACM | Terminates TLS, supports WebSockets and routes UI, `/api/*` and `/socket.io/*` by path. Integrated ACM public certificates have no additional certificate fee. | US$20–35 | US$25–60 |
| Authoritative database | RDS for PostgreSQL | Managed backups, patching and storage for application and Better Auth data; Single-AZ in staging and Multi-AZ in production. | US$20–50 | US$100–220 |
| Atomic rate limiting | ElastiCache for Valkey | Redis-compatible atomic counters and expiry without turning Redis into an application-data or message cache. | US$10–30 | US$35–100 |
| Private networking and egress | VPC, NAT Gateway/public IPv4 and data transfer | Keeps data services private and gives application tasks controlled outbound access. NAT hours and processed traffic can dominate a small environment. | US$20–45 | US$45–120 |
| Logs, alarms and secrets | CloudWatch + Secrets Manager | Centralized operational evidence, alerts and managed application credentials/rotation. | US$5–20 | US$15–60 |
| DNS and backup allowance | Route 53 + AWS-managed backups | DNS, database snapshots/retention and restore verification. ACM remains included above; domain registration is excluded. | US$2–15 | US$10–40 |
| **Planning envelope** | **All AWS components above** | **Rounded range allowing for regional price and usage variance; not an AWS quote.** | **US$100–250** | **US$300–800** |

The component ranges are budgeting envelopes rather than independently quoted line items; their rounded total deliberately allows overlap and usage variance. Domain registration, Stadia licensing, taxes and exceptional data-transfer or log volume are excluded.

### Staging

- Topology: one Fargate web task and one Fargate API task behind one ALB; ECR; Single-AZ RDS PostgreSQL; a small/serverless ElastiCache for Valkey cache; one cost-conscious outbound path; Secrets Manager; CloudWatch; Route 53/ACM; daily backups with short retention.
- Expected effort: 2–4 engineer-days for infrastructure as code, networking, secrets, image delivery, migrations, health checks, OAuth callback/domain setup, Stadia domain registration, alarms, smoke tests and rollback notes.
- Expected recurring AWS infrastructure: roughly **US$100–250/month**, plus domain registration, data-transfer/log overages and the applicable Stadia plan. RDS, ALB and NAT networking create meaningful fixed monthly cost even at low request volume.
- Operational allowance: 2–4 hours/month for dependency/runtime patches, backup checks, alert review and access rotation.

### Small production launch

- Topology: two Fargate web tasks across two Availability Zones, one effective Fargate API task behind the ALB, Multi-AZ RDS PostgreSQL with point-in-time recovery, ElastiCache for Valkey with production-appropriate replication/failover, private subnets, outbound networking, centralized logs/alarms, managed secrets and verified backups.
- Expected effort: 5–10 engineer-days for infrastructure as code, networking/security groups, delivery pipeline, migration and rollback procedures, secret rotation, monitoring/alerts, restore drill, OAuth/Stadia production setup, performance checks and runbooks.
- Expected recurring AWS infrastructure: roughly **US$300–800/month**, plus domain, traffic/log retention and the applicable Stadia commercial plan. Multi-AZ data services, NAT gateways, longer backup retention or higher availability and compliance requirements can raise this substantially.
- Operational allowance: 1–2 engineer-days/month for upgrades, incident/backup drills, cost review and security maintenance.

This production shape is not fully highly available at the application layer: the delivered Socket.IO design intentionally has one effective API instance. Multiple API tasks would require separately designed sticky routing plus a shared Socket.IO adapter, additional failure-mode tests and a revised estimate. That work is outside this assessment and is not implied by the range above.

Before approving either environment, measure expected concurrent sockets, monthly map tiles, database size/write rate, Valkey memory/key churn, build frequency, image storage, log volume, egress, recovery objectives and availability target. Reprice in the AWS Pricing Calculator for the selected account and region, then obtain a fresh map-license review.

## Final acceptance path

1. The reviewed final-delivery scope was merged as `98f4a1e9dc2cec669c18ddb5ef76535366b83c52`; its unchanged CI rerun passed exact `pnpm build` and every later workflow gate.
2. The final-submission documentation was reviewed, published through PRs [#5](https://github.com/DavidPopa/wolfpack-test/pull/5) and [#6](https://github.com/DavidPopa/wolfpack-test/pull/6), and validated by CI on the resulting `main` snapshot. Any later commit still requires its own CI result.
3. Preserve the exact provider boundaries: personal OAuth and localhost Stadia passed; Workspace, public-domain/commercial provider authorization and deployment remain `NOT_RUN`.
4. Decide any staging/deployment work separately after repricing and operational review.
