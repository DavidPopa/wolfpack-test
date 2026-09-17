# Project-local Codex setup

This directory contains the project's GPT-only instructions and skills. It does not launch agents, install plugins/MCP servers, change personal settings, or implement the application.

## Layout and discovery

- `skills/` is the canonical home of the project skills. Edit them here only.
- `../.agents/skills/` contains relative symlinks to these folders, not duplicate skill definitions. Codex discovers repository skills there and supports linked skill folders; see the [official skill documentation](https://learn.chatgpt.com/docs/build-skills).
- [config.example.toml](config.example.toml) records the execution-agent model and reasoning choice. It is an example, not an active project configuration and does not change the orchestrator's model.
- [AGENTS.md](../AGENTS.md) defines authority and read order. Engineering/testing rules and task/QA/review templates live under `docs/`.
- [SPRINTS](../SPRINTS/README.md) holds local phase plans and task/QA/review packets. Read its AI guide before sprint work; the implementation agent creates its worktree and brings only task-authorized instruction/packet files into it.

| Skill | Purpose |
| --- | --- |
| [onboard-project](skills/onboard-project/SKILL.md) | Read-only repository orientation, setup audit and owner-document map |
| [onboard-developer](skills/onboard-developer/SKILL.md) | Interactive role-aware journey through product, stack, testing and contribution workflow |
| [create-sprint](skills/create-sprint/SKILL.md) | Orchestrator creates a phase, board, ownership map and approval lock |
| [create-task](skills/create-task/SKILL.md) | Orchestrator creates one bounded, fresh-agent-ready task |
| [sprint](skills/sprint/SKILL.md) | Load and validate one approved manual sprint task |
| [execute-task](skills/execute-task/SKILL.md) | Agent implements one assigned task, with evidence |
| [qa](skills/qa/SKILL.md) | Run checks and distinguish verified, failed and blocked behavior |
| [review](skills/review/SKILL.md) | Read-only review of an actual diff or final integrated project |
| [debug](skills/debug/SKILL.md) | Reproduce a failure and investigate its cause within assigned authority |
| [when-stuck](skills/when-stuck/SKILL.md) | Change technique after repeated failure and report a precise blocker |
| [prompt-refiner](skills/prompt-refiner/SKILL.md) | Produce a faithful English prompt from rough Romanian or English intent |

Automatic skill selection is allowed; automatic agent launching is not. A skill never grants permission to commit, spawn another agent or expand the task.

## Human launch

The developer starts the agent with the implementation task in the source checkout. The agent creates its own task branch/worktree from the approved baseline and creation policy, and records actual paths. Uncommitted/ignored instructions do not propagate automatically: copy only the task's named bootstrap files, never secrets or unrelated dirty code. No commits or global skill changes are allowed for setup.

The developer can run the following with the source checkout and an approved task file:

```sh
codex -C "/absolute/source-checkout" -m gpt-5.6-sol -c 'model_reasoning_effort="medium"' 'Read AGENTS.md, SPRINTS/AI-README.md and SPRINTS/<phase>/tasks/task-<id>.md. Verify the approved plan, create the task branch/worktree safely, and record actual paths. Implement only that task and run its required checks. Update the task and stop uncommitted. Wait for me to supply QA and review instructions separately. Do not start agents.'
```

This is a human-run example, not permission for the orchestrator to execute it. Preserve GPT-5.6 Sol/medium exactly; if the installed account cannot select it, report that limitation instead of substituting another model. The orchestrator model is developer-controlled and currently GPT-5.6 Sol/high; Astra/high is reserved for harder work when the developer chooses it.

In the fresh session, use `/skills` or the skill selector to check discovery. If a skill is missing, read its `SKILL.md` directly and report the discovery problem. Do not claim discovery was runtime-tested merely because the link exists. Local CLI inspected during setup: `codex-cli 0.154.0`; recheck flags if the installation changes.

## Hooks and review

The foundation supplies one project-local [hooks.json](hooks.json) and one `PreToolUse` handler. It checks inspectable `Bash` and `apply_patch` commands without executing them and denies agent commits, recognized destructive Git/database/Redis/volume operations, and writes to real `.env*` files while allowing dummy example files and legitimate reads. Harmless fixtures run through `pnpm test:tooling`.

Per the [official OpenAI hook documentation](https://learn.chatgpt.com/docs/hooks), project hooks load only for a trusted `.codex/` layer, changed definitions require review again, and a supported denial returns `hookSpecificOutput` with `hookEventName: "PreToolUse"` and `permissionDecision: "deny"`. Use `/hooks` as the developer to inspect and trust the exact current definition. This implementation does not silently alter trust, user configuration, or model selection.

Fixture success proves parser behavior, not live route coverage or trust. Shell indirection, encoded commands, unrecognized tools, external programs that mutate state internally, and races outside `PreToolUse` can evade a small pattern guard; sandboxing, approval policy, repository authority rules and human review remain necessary. Live tool-route proof requires developer participation in the existing session and is recorded separately as `NOT_RUN` or `BLOCKED` when unavailable.

The developer supplies QA and review instructions as separate stages after implementation, in the same session or a fresh one. For final assessment review, use `review` on integrated code and final QA evidence with [REVIEW](../docs/templates/REVIEW.md). Do not fix code during a review-only stage. The orchestrator verifies the report and actual diff afterward.
