---
name: sprint
description: Load and validate an approved local sprint or task packet for the manual Wolfpack workflow. Use when the developer says sprint, start sprint, run sprint, or asks what an active task requires. Does not implement work or launch agents.
---

# Activate one manual sprint task

This project has no sprint command, automatic dispatcher, active-task registry, or orchestration framework. Activation means reading and validating the real packet, then producing a clear manual handoff.

## Select and validate

1. Read repository-root `AGENTS.md` and `SPRINTS/AI-README.md`.
2. Use the exact `SPRINTS/<phase>/tasks/<task>.md` supplied by the developer. If none is supplied, inspect phase boards and report candidates; select automatically only when exactly one task is both approved and unambiguously requested. Never infer scope from Git status alone.
3. Read the phase `sprint.md`, `sitemap.md`, `plan-lock.md`, the selected task, and every `context_must_read` path.
4. Confirm before handoff:
   - the plan is `LOCKED` and task is executable;
   - exact baseline, PR/branch slug, `.worktree/<approved-pr-slug>` policy or an explicitly approved legacy exception;
   - concrete write scope, exclusions, ownership and dependencies;
   - bootstrap allowlist, runtime isolation, required skills and verification commands;
   - separate QA and review documents exist but are not yet authorized.
5. Verify referenced local inputs exist or are explicitly declared outputs. A missing decision, stale baseline, conflicting owner, or placeholder keeps the task in draft.

## Handoff

Return a concise activation summary containing:

- task outcome, exclusions, baseline and dependency status;
- agent-created branch/worktree path policy;
- required skill and read order;
- implementation checks and stopping point;
- exact manual launch prompt for GPT-5.6 Sol/medium.

Activation never creates a worktree, edits code, starts an agent, installs dependencies, stages/commits, or begins QA/review. The developer launches the implementation agent and supplies later stages separately. Implementation then follows `.codex/skills/execute-task/SKILL.md`.
