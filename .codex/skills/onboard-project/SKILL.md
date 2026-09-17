---
name: onboard-project
description: Orient a reviewer or AI assistant to the Map Chat repository by discovering its current product boundary, architecture, commands, documentation owners, runtime topology, verification gates, and project-local AI workflow. Use for repository tours, setup audits, or onboarding-document refreshes; not for feature implementation.
---

# Onboard the Map Chat project

## Outcome

Give the user an evidence-based map of this repository as it exists now. Default to a read-only tour. Edit onboarding or guidance documents only when the user explicitly asks for a refresh.

## Required context

Read `AGENTS.md`, `README.md`, `docs/PRD.md`, `docs/ENGINEERING.md`, `docs/TESTING.md`, `docs/MAP.md`, and `docs/DELIVERY.md`. Inspect `package.json`, `pnpm-workspace.yaml`, Compose files, nginx configuration, CI, and the relevant app/package directories before describing commands or boundaries. Read `.codex/README.md` and `SPRINTS/AI-README.md` when explaining AI-assisted work.

## Workflow

1. Confirm the repository root, branch/HEAD, worktrees, and dirty state. Preserve unrelated changes and state whether the journey is read-only or an explicitly authorized documentation refresh.
2. Choose the smallest useful mode:
   - `quick tour`: product, layout, start command, and primary verification;
   - `architecture`: browser/proxy/web/API/data/realtime request flow and module owners;
   - `setup audit`: prerequisites, environment contract, ports, Compose ownership, migrations, and runnable commands;
   - `workflow`: skills, SPRINTS, worktrees, task/QA/review gates, and Git authority;
   - `documentation refresh`: correct only approved guidance files from current source evidence.
3. Establish the product boundary from the PRD and README. Distinguish public reads, Google-authenticated writes, PostgreSQL authority, Redis write-rate limiting, and Socket.IO delivery. Keep excluded features excluded.
4. Map the repository by responsibility:
   - `apps/web`: Next.js UI, Better Auth client, TanStack Query, Leaflet, optimistic state, and the browser Socket.IO client;
   - `apps/api`: Express modular monolith with auth, rooms, messages, Prisma, Redis, and Socket.IO;
   - `packages/contracts`: browser-safe HTTP and realtime contracts;
   - `infra/nginx`, Compose files, and `tests/e2e`: same-origin production topology and browser verification;
   - `docs`, `.codex`, `.agents`, and `SPRINTS`: durable documentation and local execution workflow.
5. Discover commands from the current root `package.json`; do not rely on remembered names. Explain the difference between local development, isolated test services, the production-like stack, deterministic fixtures, real Google OAuth, and live Stadia evidence.
6. Map documentation owners and evidence boundaries. Call out stale or conflicting guidance rather than silently normalizing it.
7. When teaching the AI workflow, explain that skills guide bounded work but do not grant Git, runtime, secret, or task authority. Local phase packets are ignored and are not remote submission evidence.
8. Close with a compact project map: files read, commands run, exact results, setup gaps, recommended next document, and the smallest safe next action.

## Safety and stop conditions

- Do not source or display `.env`, credentials, OAuth state, cookies, or session material during onboarding.
- Do not start/stop containers, install dependencies, mutate data, or run expensive suites unless the user asks and runtime ownership is clear.
- Do not modify product code. A requested feature or fix must move to an approved sprint/task and the appropriate execution skill.
- Stop if the repository/worktree is ambiguous, guidance conflicts with current source, or a command would touch another worktree's runtime.

## Quality bar

- Every path and command exists in the inspected checkout.
- The user can explain the product boundary, request flow, data ownership, runtime choices, verification layers, and where to investigate a failure.
- `PASS`, `FAIL`, `BLOCKED`, `NOT_RUN`, and `N/A` are used only with concrete evidence.
- The tour stays proportional to the selected mode and does not become an implementation task.
