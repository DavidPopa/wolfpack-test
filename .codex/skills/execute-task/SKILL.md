---
name: execute-task
description: Create the task worktree and implement one explicitly assigned task with scoped checks and a handoff. Stop before separate QA or review until the developer supplies that stage. Not for planning or review-only requests.
---

# Execute the assigned task

Paths below are repository-root-relative. Read `AGENTS.md` (including workflow), the complete assigned task, `docs/PRD.md`, relevant `docs/ENGINEERING.md` sections and `docs/TESTING.md` before changes.

For a task under `SPRINTS/`, also read `SPRINTS/AI-README.md` and its phase's `sprint.md`, `sitemap.md` and `plan-lock.md`. An unlocked/stale plan, missing `write_scope`, `do_not_touch`, `context_must_read`, or verification commands blocks implementation. The orchestrator owns shared sprint metadata; update only the current stage's task/evidence and allowed files. QA/review documents are later stages, not automatic follow-on work.

## Preflight

Read the approved task in the source checkout. Inspect existing branches/worktrees and dirty files, then create a new task branch/worktree from the exact approved baseline using its location/naming policy. Do not force, reset, overwrite or remove existing work, and do not create a commit for setup. If permissions prevent creation, report the precise blocker rather than working in the source checkout.

Copy only the explicitly allowed instruction/packet files needed in the new worktree; preserve skill symlinks and never copy secrets or unrelated dirty code. Record actual branch, absolute worktree, baseline and canonical task/report paths. Verify source context, contracts, shared-file ownership and dependency availability before code changes. Do not start another agent. On resuming this task or a later QA stage, use its recorded worktree rather than creating a second baseline-only checkout.

## Implement and prove

- Work only on the task's outcome. Inspect installed APIs and existing contracts instead of copying assumptions from examples. Add only authorized local dependencies.
- Use small behavior slices with a check capable of detecting a wrong implementation. For bugs, reproduce the failure before changing the cause where feasible. Mock external boundaries, not the entire behavior under test.
- Keep database/request identity, auth, optimistic rollback and event ordering invariants from the relevant engineering sections intact. Request cross-owner changes rather than editing shared contracts or lockfiles outside scope.
- Run applicable gates in `docs/TESTING.md` order. Missing required suites or services are failures/blockers, not waived success. Use `debug` for non-obvious failures without expanding fix authority.

## Close out one task

Audit the committed delta from the task base, staged/unstaged changes, and untracked files. Explain every task-owned change; do not remove another person's work. Update the implementation task with actual check evidence, counts, limitations and the tested snapshot.

Mark acceptance items only when supported by implementation evidence; formal QA acceptance remains pending. Report the exact worktree and task paths, then stop uncommitted. Wait until the developer supplies QA, review or fix instructions; the same agent may continue then. No automatic staging, commit, push, merge, agent launch or next-stage execution.
