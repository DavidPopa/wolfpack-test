# SPRINTS

Local planning and execution workspace, adapted from `dragoon-matrix/SPRINTS`. The layout keeps the source project's sprint board, scope map, plan approval and closeout, with separate task/QA/review documents for our manual-agent workflow.

## Structure

```text
SPRINTS/
  README.md
  AI-README.md
  .gitignore
  phase-NNN-short-slug/
    sprint.md              objective, task board, dependencies, PR order
    sitemap.md             allowed surfaces and ownership
    plan-lock.md           approved plan revision and baseline
    closeout.md            final scope/evidence/risk summary
    tasks/task-NNN.md       assignment and implementation checklist
    qa/task-NNN.md          verification results and evidence
    reviews/task-NNN.md     written findings and disposition
    evidence/              optional sanitized logs/screenshots
```

`evidence/` is created only when needed. Sprint packets are local and ignored by Git. Only this README, [AI-README](AI-README.md) and `.gitignore` are versionable here; nothing is committed automatically. Ignored does not mean safe for secrets or backed up.

## Use

1. The orchestrator creates or updates a phase with a bounded objective and a task board. Use only as many tasks as the work needs; no minimum task counts or imported enterprise framework.
2. Fill each task's `write_scope`, `do_not_touch`, `context_must_read`, dependencies, worktree creation policy and verification commands using the templates under `docs/templates/`.
3. The developer approves the actual plan. Record that approval, exact baseline and plan revision in `plan-lock.md`. A draft/unlocked phase cannot start implementation. This is a manual approval record, not an installed hash checker.
4. The developer starts a Sol/medium agent with one implementation task. The agent creates its own branch/worktree from the approved baseline and records its actual location. Independent tasks may run in parallel only with approved disjoint ownership; the board records integration order separately.
5. The agent implements, runs required implementation checks, updates the task and stops. The developer supplies QA and review instructions separately afterward; the same agent may continue. Only after these stages does the orchestrator perform its final check. The developer alone commits, publishes and merges PRs.
6. Complete `closeout.md` against the integrated snapshot, with verification, fixed/deferred findings, remaining risks and real PR/merge status. Reapprove the plan if scope, baseline, dependencies or ownership change.

## Git and delivery

- Do not force-add sprint packets. Accepted engineering decisions belong in durable owner docs/code, not only in ignored notes.
- PR descriptions must summarize evidence or link to durable reports/CI; a local `SPRINTS/...` path alone is not accessible to remote reviewers.
- The assessment's final review and infrastructure estimate must be written to versionable files under `docs/` before submission. Keep sanitized proof sufficient to understand them without the local sprint workspace.
- Local/ignored files do not transfer to a new worktree or clone. The task authorizes copying a specific instruction/packet set into the agent-created worktree, not secrets or unrelated dirty files. Record actual task/report paths for later QA and orchestrator access; do not commit as a workaround.

## Current local phase

`phase-001-foundation` contains the existing foundation draft and its QA/review destinations. It is **DRAFT / UNLOCKED**, not approved for implementation.

No Matrix scripts, profile system, automatic agent dispatch or `make orch-*` commands are installed. Read [AGENTS.md](../AGENTS.md) for authority/workflow and [AI-README](AI-README.md) for task entry instructions.
