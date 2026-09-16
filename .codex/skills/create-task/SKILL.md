---
name: create-task
description: Create or refine one executable implementation, QA, or review task inside an existing approved sprint, including scope, dependencies and acceptance evidence. Does not implement code or start agents.
---

# Create one bounded task

Read repository-root `AGENTS.md`, `docs/PRD.md`, `docs/templates/TASK.md`, relevant `docs/ENGINEERING.md` and `docs/TESTING.md` sections, then inspect actual files and commands. For sprint work, also read `SPRINTS/README.md`, `SPRINTS/AI-README.md`, and the target phase's board, scope map and plan lock.

If the developer explicitly asks to refine a rough/non-English handoff first, use `.codex/skills/prompt-refiner/SKILL.md`. Refinement is not a substitute for product decisions or approval.

1. Confirm the existing phase, one observable outcome, actual baseline and task identity. Do not create a task in a vague or conflicting sprint.
2. Define exact `write_scope`, `do_not_touch`, shared-file ownership, dependencies, integration order, failure/escalation conditions and documentation impact. Propose parallel work only with disjoint ownership and available dependencies.
3. Specify the approved PR/branch slug and standard agent-created path `.worktree/<approved-pr-slug>`, except an explicitly documented legacy exception. Require the agent to record the absolute path and developer run/test commands.
4. Name the exact bootstrap packet allowlist, required reads, local skills, runtime isolation, allowed installs, commands to create, verification order and stopping point. Never copy secrets or unrelated dirty work.
5. Turn requirements into observable acceptance criteria and negative cases. Match proof to the boundary: static checks, real PostgreSQL/Redis, browser, realtime transport and real Google OAuth are distinct evidence.
6. Prepare separate implementation, QA and review documents from the templates. Their existence does not authorize later stages; the developer supplies each stage separately.
7. Verify every referenced input exists or is explicitly an output. Missing baseline, worktree policy, ownership, acceptance behavior or required decisions means the task remains `DRAFT`.
8. Update the phase board/scope map as orchestrator-owned metadata. Record the developer's actual approval and exact revision in `plan-lock.md` only after the complete task is accepted.

Do not implement code, install dependencies, create branches/worktrees, launch agents, stage/commit, publish a PR, or claim runtime verification. Sprint packets remain ignored local state; identify decisions/reports that must later move into versionable documentation.

Return the task/QA/review paths, scope summary, dependencies and parallelism recommendation, unresolved decisions, and the manual launch prompt. A fresh GPT-5.6 Sol/medium agent should be able to execute the task without this conversation.
