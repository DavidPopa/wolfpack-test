# QA — <task-id>

Template: fill with observed results. Leave checkboxes unchecked until supported by evidence.

Execute only after the developer supplies this QA stage. Use the implementation task's recorded worktree and uncommitted changes; do not create a fresh checkout that lacks them. The same agent may continue, but label the reviewer role accurately.

## Snapshot and authority

- Task: <path>; reviewer role: implementer self-check / separately launched QA
- Worktree / branch / baseline / HEAD: <values>
- Verification timestamp and dirty-file inventory: <values>
- Runtime/tool versions and isolated service identifiers: <values>
- Scope: <what was and was not tested>; code fixes authorized: yes/no

## Human-readable change audit

List what the implementation actually changed before reporting test results. This section is written for the developer to review without reconstructing the diff.

| Task / acceptance ID | What changed in plain language | Actual files / important lines | How QA inspected or exercised it | Status |
| --- | --- | --- | --- | --- |
| <ID> | <observable behavior or technical change> | <paths and relevant lines/symbols> | <inspection, command or scenario> | NOT_RUN |

Cover every material task outcome and explicitly identify unexpected, missing, or out-of-scope changes. A file list alone is not a change explanation, and a PASS without inspecting the corresponding implementation is invalid.

## Gates

Allowed statuses: `PASS`, `FAIL`, `BLOCKED`, `NOT_RUN`, `N/A` with reason. A listed command is not evidence of execution.

| Gate | Exact command / working directory | Status | Exit / collected tests | Sanitized evidence or reason |
| --- | --- | --- | --- | --- |
| ESLint | <command> | NOT_RUN | — | — |
| TypeScript | <command> | NOT_RUN | — | — |
| Backend Jest unit | <command> | NOT_RUN | — | — |
| Backend Jest integration | <command> | NOT_RUN | — | — |
| Frontend Jest/RTL | <command> | NOT_RUN | — | — |
| Production build | <command> | NOT_RUN | — | — |
| Chromium E2E | <command> | NOT_RUN | — | — |
| Real Google OAuth smoke, if applicable | <scenario> | NOT_RUN | — | — |
| PR CI, if a PR exists | <run URL and tested commit> | NOT_RUN | — | — |

## Behavior evidence

| Acceptance ID | Setup and action | Expected result | Actual result | Status / evidence |
| --- | --- | --- | --- | --- |
| <ID> | <reproducible scenario> | <observable result> | <observed result> | NOT_RUN |

Include the task's negative cases and relevant concurrent/late-event cases. Distinguish mocked dependencies, real services, real browser checks and real OAuth; none implies the others passed.

## Failures and limitations

| ID | Failure/blocker | Reproduction / evidence | Impact | Next action / owner |
| --- | --- | --- | --- | --- |
| <ID or explicitly none> | <description> | <reference> | <impact> | <action> |

## Closeout

- [ ] Acceptance criteria traced to evidence, including untested/blocked cases.
- [ ] No skipped/empty suites or stale pre-change results presented as passes.
- [ ] Reports and retained traces contain no credentials, tokens or session data.
- [ ] Actual changed files checked against task scope, including untracked files.
- [ ] Every material modification is represented in the human-readable change audit and can be understood by the developer.
- [ ] QA outcome stated: verified / changes required / blocked / partial.

<State remaining risk, what must be rerun after changes/integration, and whether a separate reviewer has actually checked this snapshot.>
