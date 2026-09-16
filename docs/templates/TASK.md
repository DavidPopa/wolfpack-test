# <task-id> — <one observable outcome>

Template: replace placeholders before assignment. This is not an executable task yet.

## Assignment

- Status: NOT_STARTED
- Sprint / task ID / approved plan revision: <phase, task-NNN, revision>
- Role: implementation / diagnosis-only / QA-only / review-only
- Model: GPT-5.6 Sol; reasoning: medium; launched manually by the developer
- Worktree setup: agent creates `.worktree/<approved-pr-slug>` under the source checkout, named from the approved PR/branch slug; <exact slug and branch naming rule>. Confirm `.worktree/` is ignored before creation. (`phase-001-foundation/task-001` is the only legacy-location exception.)
- PR base / exact baseline commit: <values>
- Actual branch / absolute worktree: <agent records after safe creation>
- Bootstrap instruction/packet files allowed to copy: <exact source paths; no secrets or unrelated dirty code>
- Canonical task/report paths: <record where later stages and orchestrator read results>
- Developer test entrypoint: `cd <absolute worktree>` followed by <exact install/start/test commands and required services>
- Task dependencies and availability: <integrated commit or developer-approved stacked baseline>
- Integration order: <position in sprint board; not permission for automatic merge>
- Later QA document: <path>; review document: <path>; do not execute either until separately supplied by the developer
- Timebox / escalation point: <appropriate for remaining assessment time>

## Context and outcome

<Describe current behavior, desired outcome, relevant PRD requirement, and actual code/config evidence. Make this understandable to an agent with no conversation history.>

## Read and use

- `context_must_read`: `AGENTS.md`, `docs/PRD.md`, `SPRINTS/AI-README.md`, the assigned phase's `sprint.md`, `sitemap.md`, `plan-lock.md`, and the exact additional paths below.
- Skill(s): <exact local skill paths, starting with the assigned role>
- Relevant engineering/testing sections: <sections>
- Existing code/contracts/test patterns to inspect: <paths>
- External documentation needed: <official sources and version questions, if any>

## Scope and ownership

- `write_scope`: <specific files/directories, including this task and its evidence documents>
- `do_not_touch`: <adjacent surfaces, shared sprint metadata, PRD unless explicitly approved>
- Shared-file owner: <lockfile, contracts, schema/migrations, Compose as applicable>
- Can run in parallel with: <task IDs and disjoint ownership, or none>
- Must wait for: <dependencies>
- Runtime isolation: <assigned ports, Compose project, test database and Redis namespace>

No commits, auto-staging, agent launches, other-worktree edits, PR publication or scope expansion. Stop and report a dependency/contract mismatch before changing another owner's files.

## Prerequisites and implementation

- Already installed/available: <observed tools and versions>
- Install only: <task-required local dependencies; exact package/runtime constraints>
- Secrets/service access: <names and developer setup, never values>
- Commands/configuration this task must create: <distinguish from currently available commands>
- Ordered work: <concrete small steps and design constraints; no unrelated refactors>

## Acceptance checklist

- [ ] <observable behavior + verification scenario>
- [ ] <negative/failure case>
- [ ] <contract/integration requirement>
- [ ] Required implementation checks and their evidence recorded in this task.
- [ ] Scope audit, known limitations and actual worktree/report locations recorded.

Each completed item references implementation check evidence. Formal QA/review remains pending until the developer supplies that stage; code written or an implementation check passing does not imply independent QA acceptance.

## Verification and handoff

`verification`: <List exact commands, where to run them, expected collected suites, startup/cleanup boundaries and manual scenarios. Follow lint → types → backend Jest → frontend Jest → build → Chromium; justify any N/A.>

Implementation closeout: summarize changes, list touched files including untracked files, record commands/results and blockers in this task, and stop uncommitted. Wait for the developer to provide QA, review or fix instructions; do not start the next stage or task automatically.
