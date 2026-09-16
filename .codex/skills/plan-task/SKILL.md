---
name: plan-task
description: Prepare or refine an implementation, QA, or review task for a fresh manually launched agent, including scope, dependencies and acceptance evidence. Does not implement code or start agents.
---

# Plan one task

Paths below are relative to the assigned repository root. Read `AGENTS.md` (including workflow), `docs/PRD.md`, and `docs/templates/TASK.md` before writing a task. Read relevant `docs/ENGINEERING.md` and `docs/TESTING.md` sections, then inspect actual files and available commands.

For sprint organization, read `SPRINTS/README.md` and `SPRINTS/AI-README.md`. Keep local packets under `SPRINTS/phase-NNN-slug/`: sprint board, scope map, manual plan lock, closeout, and separate tasks/QA/reviews. Update an existing phase when appropriate; do not duplicate it under another task directory. A scaffold request is not implementation approval.

1. Identify one observable outcome and the real baseline. Do not infer installed tooling from a planned script or treat another worktree's dirty files as an available dependency.
2. Specify allowed files, exclusions, shared-file ownership, dependencies and failure/escalation conditions. Include the exact baseline, safe worktree location/branch naming policy, and instruction/packet files allowed to copy. The execution agent creates its own worktree and records actual paths; the developer launches agents. Propose parallel work only where ownership is disjoint and contracts are stable.
3. Give a fresh agent all necessary context without relying on this conversation. Name exact local skill paths under `.codex/skills/`, required reads, local dependencies to install, existing commands, and commands the task must create. No global installs or irrelevant source-project tooling.
4. Turn requirements into observable acceptance criteria with negative cases. Use behavior-level tests and realistic integration boundaries; include race/retry cases for optimistic or realtime changes.
5. Prepare separate QA and review documents from the templates, with checks unmarked and statuses unverified. The developer supplies these stages later; their existence does not authorize automatic execution. Implementation checks are recorded in the implementation task, followed by an explicit stop.
6. Verify every referenced input exists or is clearly identified as an output to create. Missing worktree creation policy/baseline, ownership or behavior decisions mean the packet is a draft; the worktree itself need not exist before assignment.

Before execution, record actual developer approval, baseline, dependencies and scope revision in the phase's `plan-lock.md`; otherwise leave it UNLOCKED. Do not fabricate automated lock/contract checks or install the source project's orchestration framework. Sprint packets are ignored local state; identify any final reports/decisions that must be promoted to versionable docs for delivery.

Deliver the task paths, dependency/parallelism recommendation, and decisions needing the developer. Stop before code, installs, agent launches, Git mutations or PR publication.
