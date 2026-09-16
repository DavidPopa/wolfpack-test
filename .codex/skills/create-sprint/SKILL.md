---
name: create-sprint
description: Create or refine a local SPRINTS phase with an objective, ownership map, bounded tasks, separate QA/review packets, dependencies and a manual approval lock. Planning only; does not implement or launch agents.
---

# Create one approved sprint phase

Read repository-root `AGENTS.md`, `docs/PRD.md`, `SPRINTS/README.md`, `SPRINTS/AI-README.md`, and the task/QA/review templates. Inspect the repository, existing phases, current branches/worktrees, available commands and unfinished work before proposing another phase.

## Plan before writing

1. Convert the request into one product or engineering outcome, explicit non-goals, affected surfaces, dependencies and evidence needed. Use `prompt-refiner` only when the developer explicitly requests an English agent prompt or the raw intent cannot be handed off faithfully.
2. Decide the smallest coherent phase and task split. Use as many tasks as ownership and dependency boundaries require—there is no minimum quota. Shared manifests/lockfile, contracts, schema/migrations and Compose/proxy each need one writer at a time.
3. Identify which tasks can actually run in parallel, their isolated runtime resources, PR/integration order, and the exact committed or developer-approved stacked baseline each requires.
4. Present the proposed phase/task board and decisions to the developer before making it executable. Do not treat a request for discussion or scaffolding as implementation approval.

## Build the packet after approval to scaffold

Create or update only the appropriate `SPRINTS/phase-NNN-slug/` packet:

- `sprint.md`: objective, scope/non-goals, board, dependencies, parallelism and integration order;
- `sitemap.md`: file/surface ownership and hard boundaries;
- `plan-lock.md`: manual approval revision, exact baseline, branch/worktree policy and unresolved blockers;
- `closeout.md`: pending integrated evidence, risks and durable deliverables;
- one `tasks/task-NNN.md`, `qa/task-NNN.md`, and `reviews/task-NNN.md` set per bounded task.

Use `.codex/skills/create-task/SKILL.md` for every executable task. Future task worktrees use `.worktree/<approved-pr-slug>` and must record direct developer run/test commands. Keep the plan `UNLOCKED` while any task contains placeholders, overlapping ownership, missing verification, an unapproved baseline or a material product decision.

After the developer approves the complete revision, record that approval and mark the plan `LOCKED`. The developer may then use `.codex/skills/sprint/SKILL.md` to validate/activate one task and manually launch its executor.

## Boundaries and verification

Do not implement application/tooling code, install frameworks, create worktrees, run QA/review, start agents, stage/commit, or publish PRs. Do not import source-project commands or arbitrary task-count rules. Phase packets are ignored local planning state; durable product decisions and final reports must be promoted to versionable owner docs when required.

Before handoff verify:

- every relative path and referenced input exists or is a declared output;
- every executable task has concrete scope, exclusions, dependencies, skills, commands, acceptance and stage stop;
- task ownership does not overlap concurrent work;
- plan-lock status matches real developer approval;
- QA/review start unverified and make no PASS claims;
- packet files remain ignored as intended and versionable guides contain no local-only evidence dependency;
- Markdown/link/whitespace checks pass.

Return the phase path, task list/order, parallelism recommendation, approval/lock status, unresolved decisions, and the next manual activation step.
