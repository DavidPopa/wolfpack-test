---
name: onboard-developer
description: Run an interactive, role-aware developer onboarding journey through Map Chat's product, local runtime, Next.js frontend, Express API, PostgreSQL/Prisma data model, Better Auth, Redis, Socket.IO, testing, documentation, and sprint/worktree workflow. Use for a first-day tour or focused full-stack, frontend, backend, QA, or reviewer onboarding; not for implementing a task.
---

# Onboard a Map Chat developer

## Outcome

Guide a human developer or reviewer through the project as an interactive learning journey. Connect product behavior to owning files and focused evidence, then pause at meaningful checkpoints instead of delivering one oversized checklist.

## Inputs

Confirm the audience (`full-stack`, `frontend`, `backend`, `QA`, `reviewer`, or `AI-assisted contributor`), pace (`quick`, `day one`, or `deep dive`), and whether commands may be run. If the user does not choose, default to a quick read-only full-stack tour.

## Required context

Read `AGENTS.md`, `README.md`, `docs/ONBOARDING.md`, `docs/PRD.md`, and the documentation relevant to the selected module. Inspect current source and root scripts before teaching them. For runtime or test guidance, read `docs/TESTING.md`, `.env.example`, Compose files, and `docs/MAP.md`. For AI-assisted contribution guidance, also read `.codex/README.md` and `SPRINTS/AI-README.md`.

## Journey loop

For each selected stage:

1. Explain the user-facing reason the layer exists.
2. Show the current owner files and the path a request or event follows.
3. State the invariant a contributor must preserve.
4. Run or name one focused proof only when safe and relevant.
5. Summarize what the developer should now understand, then offer the next stage or a deeper branch.

## Default journey

1. **Orientation:** repository status, product goal, included/excluded scope, monorepo layout, Node/pnpm requirements, and documentation map.
2. **Runtime:** local development versus production-like Compose, nginx same-origin routing, ports, health/readiness, migrations, volume preservation, and runtime ownership.
3. **Backend:** Express runtime and modular `auth`, `rooms`, `messages`, and `rate-limit` responsibilities; session-derived identity; validation; persistence-before-response/broadcast.
4. **Data and authentication:** Prisma/PostgreSQL schema, stable ordering, idempotency keys, Better Auth's Google-only flow, session storage, Redis atomic limits, and fail-closed writes with public reads available.
5. **Frontend and map:** Next.js App Router, Tailwind/shadcn styling, TanStack Query ownership, Leaflet provider/attribution, room selection, drafts, optimistic reconciliation, and accessible responsive chat behavior.
6. **Realtime:** the single Socket.IO lifecycle, global room events, selected-room message subscriptions, deduplication, room switching, and reconnect catch-up across pages.
7. **Verification:** ESLint, TypeScript, API unit/integration, React Testing Library, production build, Chromium, tooling, and hooks. Distinguish fixtures from real PostgreSQL/Redis, OAuth, live provider, and CI evidence.
8. **Contribution workflow:** approved sprint/task packet, agent-created `.worktree/<slug>`, implementation then separately supplied QA and review, evidence statuses, developer-owned Git integration, and no automatic continuation.
9. **First contribution:** identify one bounded outcome, owners, dependencies, protected surfaces, focused proof, and the approval required before any implementation begins.

Role-focused tours may skip unrelated stages but must retain product boundaries, safety, and evidence distinctions.

## Useful focused proofs

Choose proportionally and record exact results. Examples include `git status --short --branch`, `pnpm lint`, `pnpm typecheck`, one documented focused Jest suite, read-only Prisma validation, or health/readiness when the user has explicitly assigned the runtime. Do not replay the complete ordered suite merely for orientation.

## Safety and stop conditions

- Preserve dirty work and other worktrees. Onboarding does not authorize source edits, dependency installation, container operations, data cleanup, or Git actions.
- Never expose `.env` values, Google credentials, sessions, cookies, or provider secrets.
- Do not represent fixture auth, intercepted tiles, local checks, or same-agent review as stronger evidence classes.
- If the user asks to implement work, stop the onboarding journey and route it through `create-sprint`/`create-task`, then the separately authorized `execute-task`, `qa`, and `review` stages.
- Stop when the current checkout contradicts documentation; report the exact disagreement and owner document.

## Session closeout

Return completed stages, files visited, commands and exact outcomes, concepts the developer should now understand, unresolved access/setup gaps, and the recommended next stage. Do not claim onboarding completion for stages that were skipped.
