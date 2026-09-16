# Map Chat — agent entry point

## Authority and roles

- Follow the developer's current instructions. The [PRD](docs/PRD.md) defines product intent; actual code, tests and command output establish what works. Report disagreements instead of changing scope.
- Only the human developer commits, including temporary commits and amend. Do not stage, push, merge, rebase, cherry-pick, publish a PR or change Git configuration without explicit assignment; committing remains human-only.
- The orchestrator plans, writes task/configuration documentation and reviews evidence and actual changes. It does not implement application/tooling code or start agents.
- The developer starts fresh GPT-5.6 Sol/medium terminal agents. No subagents, background agent sessions or automatic model changes. The orchestrator currently uses GPT-5.6 Sol/high; the developer may switch it to Astra/high for unusually difficult review or reasoning work.
- Preserve pre-existing changes. Do not reset/stash user work, reset databases, remove volumes, bypass hooks or weaken checks. Report missing authority, dependencies or credentials precisely.
- Do not expose credentials, cookies, OAuth tokens, real environment values or session files in reports. Dummy environment examples are allowed.

## Read order and skills

Read this file, the assigned task, the PRD, the applicable skill and relevant [engineering](docs/ENGINEERING.md)/[testing](docs/TESTING.md) sections, then inspect current source and commands.

Canonical skills live in `.codex/skills/`; `.agents/skills/` contains discovery symlinks only. If discovery fails, read the canonical `SKILL.md` directly.

| Work | Skill |
| --- | --- |
| Create or refine a sprint phase | `create-sprint` |
| Create one bounded task and its evidence requirements | `create-task` |
| Load and validate an approved sprint/task packet | `sprint` |
| Implement an assigned task | `execute-task` |
| Verify behavior and record evidence | `qa` |
| Review a diff or final integrated project | `review` |
| Investigate a failure or race | `debug` |
| Recover after repeated failed approaches or unclear next steps | `when-stuck` |
| Refine a rough Romanian/English instruction into an English agent prompt | `prompt-refiner` |

Skills do not grant broader authority. Diagnosis, QA and review-only requests do not authorize code fixes. Do not import additional rules from the source projects during normal execution.

## Workflow

1. The orchestrator prepares a task with outcome, baseline, worktree, scope/ownership, dependencies, required installs/skills and observable acceptance criteria, plus separate QA and review documents. Use the [task](docs/templates/TASK.md), [QA](docs/templates/QA.md) and [review](docs/templates/REVIEW.md) templates. A draft with missing assignments is not executable.
   Local packets live under `SPRINTS/phase-NNN-slug/`; follow the [sprint guide](SPRINTS/AI-README.md). The developer-approved plan lock must be current before implementation. The orchestrator owns shared sprint metadata; executors update only their assigned task/evidence.
2. The developer approves the task and manually starts the agent with the implementation document. The agent creates its task branch/worktree from the approved baseline, following the task's location/naming policy, and records the actual paths before implementation.
3. The agent implements only that task, runs its required implementation checks in the documented order, updates the task with results and limitations, and stops uncommitted. It does not automatically begin the separate QA or review stages.
4. The developer later supplies the QA document, then any review/fix instructions, when each stage should run. The same agent may continue; a fresh session is optional, not required. QA must inspect the actual implementation worktree, including uncommitted changes. Self-review is not independent review.
5. Once those stages are complete, the orchestrator checks the task, QA, review and actual diff/source, including untracked files, and reports corrections or readiness.
6. The developer commits, pushes and publishes the scoped PR; CI and PR review precede developer merge. A local pass is not a CI pass or merge approval.

Every handoff records base/HEAD, task-owned committed/staged/unstaged/untracked changes, exact verification results and known limitations. Use `PASS`, `FAIL`, `BLOCKED`, `NOT_RUN` and justified `N/A`. Stop after one task with changes uncommitted; do not automatically begin the next task.

## PRs, worktrees and parallelism

- One coherent PR scope per task branch/worktree. The implementation agent creates its own branch/worktree as part of the approved task; integration stays with the developer. Inspect existing branches/worktrees first, use a non-conflicting path/name, never force/reset/remove an existing worktree, and never create a temporary commit for setup.
- Starting with the task after `phase-001-foundation/task-001`, create worktrees under the source checkout at `.worktree/<approved-pr-slug>`, using the approved PR/branch slug as the directory name. Ensure `.worktree/` is ignored by the root repository before creation. The task must record the exact absolute path and runnable commands so the developer can enter that worktree and test the implementation directly. The current foundation worktree at `/Users/dxd/Desktop/wolfpack-test-worktrees/task-001-foundation` is an explicit legacy exception and must not be moved.
- Foundation comes first. Backend/frontend work can run in parallel after contracts stabilize and ownership is disjoint; cost research can run independently.
- Root manifests/lockfile, contracts, schema/migrations and Compose/proxy each have one owner at a time. Request cross-owner changes rather than editing concurrently.
- Dependencies must be available in the assigned checkout. Wait for integration unless the developer explicitly chooses stacked PRs.
- Isolate runtime ports, Compose project names, databases and Redis namespaces. Never clean another worktree's resources.
- Uncommitted/ignored setup files do not propagate to new worktrees. The task names the instruction/packet files the agent may copy into its new worktree; preserve relative skill links and record the canonical packet/report locations. Do not copy secrets or unrelated dirty code, overwrite existing work, or commit as a workaround. Other worktrees remain read-only sources, except explicitly assigned packet updates.
- Sprint packets are ignored local state, following [SPRINTS policy](SPRINTS/README.md). Do not force-add them. Summarize evidence in PRs and promote required final reports/decisions into versionable owner files; local links alone are not submission evidence.
- Rerun affected checks after changes, integration or conflict resolution. Final handoff requires the complete suite and a written `review` of integrated code with fixed/deferred findings and reasons.

The PRD was committed before code at `dad61fa`; verify the current baseline. The developer chooses when these local workflow files enter a later PR. No application scripts, CI or executable hooks are installed by this documentation setup.

## Navigation

- [Codex setup and human launch](.codex/README.md)
- [Sprint workspace and current local phase](SPRINTS/README.md)
