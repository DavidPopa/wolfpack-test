---
name: when-stuck
description: Recover from a blocked task by identifying the stuck state, changing technique, and reporting a precise next step or blocker. Use after the same approach fails twice, evidence conflicts, or no safe next action is clear.
---

# Recover without widening scope

Read repository-root `AGENTS.md`, the active task and stage document, and the relevant owner code or documentation. Preserve the current authority: this skill does not authorize fixes during QA/review, new agents, commits, destructive cleanup, or scope expansion.

## Diagnose the stuck state

1. Stop the repeated approach. Capture the exact failure, current snapshot, files touched, and the last two materially different attempts.
2. Classify the block, then choose one different technique:
   - **Ambiguous intent or ownership:** reread the task/plan lock and ask one focused question only if the answer changes the work.
   - **Cannot locate behavior:** search unique UI text, route names, contracts, tests, call sites, configuration, and runtime entrypoints.
   - **Persistent bug or failed gate:** use `.codex/skills/debug/SKILL.md`; reproduce the smallest failing signal and trace backward from evidence.
   - **Environment or dependency mismatch:** verify the actual worktree, runtime, installed package API, ports, service ownership, environment names, and test collection.
   - **Scope creep or missing decision:** separate requested work from newly discovered work and report the exact decision/dependency needed.
   - **Evidence mismatch or apparent success:** inspect the actual diff, untracked files, collected tests, exit codes, and runtime behavior before claiming completion.
   - **Task too large:** stop implementation and request a new bounded task through `.codex/skills/create-task/SKILL.md`, or a new phase through `create-sprint`; do not split or dispatch work autonomously.
3. Execute one discriminating check that can confirm or reject the new hypothesis. Do not rerun an unchanged command expecting a different result.
4. After a permitted fix, rerun the smallest failing signal and the affected ordered gates. During QA/review-only work, record the finding instead of applying a fix.

## Escalation

If three distinct techniques fail, or progress requires credentials, a product decision, another owner's files, destructive cleanup, or unavailable external state, stop. Report:

- stuck category and exact symptom;
- attempts and what each ruled out;
- strongest remaining hypothesis;
- precise missing input or decision;
- safest next action and verification that would prove recovery.

Do not hide uncertainty, bypass checks, reset/stash unrelated work, change the approved baseline, or report a fabricated PASS.
