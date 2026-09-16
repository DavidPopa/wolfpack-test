# SPRINTS — agent entry guide

This supplements [AGENTS.md](../AGENTS.md). An approved implementation task authorizes its worktree setup, not commits, unrelated Git changes or agent launches.

## Read order

1. Root `AGENTS.md` and `docs/PRD.md`.
2. This guide, then the assigned phase's `sprint.md`, `sitemap.md` and `plan-lock.md`.
3. The exact assigned task and every item in its `context_must_read`.
4. The applicable skill under `.codex/skills/` and relevant engineering/testing sections.

Use `plan-task` for authoring, `execute-task` for authorized implementation, `qa` for verification, `review` for findings, and `debug` when investigating failures. There is no separate automatic sprint executor.

## Preflight and boundaries

- First read the packet in the source checkout. Confirm the approved baseline and worktree creation policy, inspect existing worktrees/branches, then create the task's non-conflicting branch/worktree. Record its absolute path and baseline; copy only the task-authorized instruction/packet files. Confirm required context is available there before implementation.
- Require concrete `write_scope`, `do_not_touch`, `context_must_read`, verification commands and acceptance criteria. Empty fields or unresolved assignments mean DRAFT, not permission to improvise.
- Scope changes require updated task/sitemap/plan approval before affected work. Do not edit another owner's contracts or lockfile to unblock yourself.
- Edit only the assigned task-owned surfaces and evidence documents. The orchestrator owns the shared sprint board/lock/closeout to avoid parallel writers.
- Run the applicable ordered gates in `docs/TESTING.md`. Checkboxes require proof; record FAIL/BLOCKED/NOT_RUN distinctly. Do not manufacture a pass from an empty suite.
- Finish implementation with required checks and results in the task, then stop uncommitted. Separate QA/review documents remain pending until the developer supplies those stages. No agent spawning, automatic batch continuation, commit, staging, push or merge.
- Later QA/review uses the actual implementation worktree and dirty changes, not a new checkout of the baseline. The developer may use the same agent or a fresh session.
- Review-only/QA-only sessions do not authorize fixes. Record findings for the developer/orchestrator instead.

## Human launch prompt

Replace the phase/task names after approval, then give this to the terminal agent:

```text
Read AGENTS.md and SPRINTS/AI-README.md.
Read the assigned phase's sprint.md, sitemap.md and plan-lock.md.
Execute only SPRINTS/<phase>/tasks/task-<id>.md.
Create its branch/worktree from the approved baseline and location/naming policy.
Record the actual worktree and packet/report paths; preserve existing work.
Read context_must_read, obey write_scope and do_not_touch, and use the task's skills.
Stop if the plan is unlocked, required fields are missing or the baseline differs.
Run the implementation checks and record results in the task, then stop.
Wait for me to supply the separate QA and review instructions afterward.
Do not start agents, commit, stage, push, merge or continue to another stage/task.
```

Source-framework commands such as `make sprint` and `make orch-check` are not available here. Do not claim they were run or install the framework to satisfy a copied instruction. Use the concrete commands specified by the assigned task.
