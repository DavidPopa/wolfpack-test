# Review — <task-id or final integrated project>

Execute only after the developer supplies this review stage. Inspect the recorded implementation worktree/snapshot; a new baseline-only checkout does not contain uncommitted implementation. The same agent may continue; that is not independent review.

## Review identity and snapshot

- Mode: implementer self-review / separately launched review / orchestrator final check
- Reviewer and timestamp: <values>
- Task / QA: <paths>
- Worktree / branch / baseline / HEAD / dirty files: <values>
- Inspected scope and exclusions: <paths and surfaces>
- Evidence independently rerun versus supplied by another agent: <distinguish>

## Human-readable change summary

Summarize the implementation the developer is being asked to accept. Describe the resulting behavior and architecture, not merely filenames or commit statistics.

| Area / task ID | What was implemented or changed | Key files / entrypoints | QA evidence checked | Review assessment |
| --- | --- | --- | --- | --- |
| <area or ID> | <plain-language result> | <paths and relevant symbols> | <QA scenario/command/report reference> | correct / incomplete / defective / unverified |

Include unexpected changes and explicit omissions. The developer should be able to compare this table with the task and understand what will enter the PR before reading the full diff.

## Findings

Prioritize confirmed impact, not stylistic preference. Use `critical`, `high`, `medium`, `low`; mark uncertainty explicitly. If no actionable findings exist, say so with the scope and verification limits.

| ID | Severity / confidence | Scenario and impact | File:line / evidence | Disposition |
| --- | --- | --- | --- | --- |
| <ID> | <severity; confirmed or needs verification> | <trigger and consequence> | <actual location and proof> | open / fixed / deferred / rejected |

## Resolution record

| Finding | Change or deferral reason | Regression verification | Remaining risk / owner |
| --- | --- | --- | --- |
| <ID> | <why fixed, deferred, or rejected> | <command/scenario and result> | <risk> |

Do not mark a finding fixed based only on an implementer's claim. Inspect the change and relevant regression evidence; identify blocked runtime verification separately.

## Review lenses

- PRD/task scope, unnecessary dependencies, architecture ownership.
- Auth/trusted origin/privacy; validation and database invariants.
- Retry/idempotency, realtime ordering, reconnect and cache reconciliation.
- Failure paths, Redis outage, UI/accessibility and runtime/proxy behavior.
- Tests that would detect the problem, evidence freshness and missing coverage.

Apply only relevant lenses; record major exclusions rather than claiming a full audit.

## Verdict and handoff

Verdict: pending / ready for developer review / changes required / blocked.

<State blockers, non-blocking risks, deferred reasons, scope drift if any and needed reruns. This verdict is not a merge, commit, CI result or approval by the developer.>

For final submission, explicitly list fixed and deferred findings across the integrated application and link the final full-suite evidence.

Before a `ready for developer review` verdict, confirm that the human-readable summary covers every material task outcome, all findings have a disposition, and the described behavior matches the actual diff rather than the implementer's narrative alone.
