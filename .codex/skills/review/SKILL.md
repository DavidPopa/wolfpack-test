---
name: review
description: Review a task diff or final integrated project and write evidence-based findings, fixed/deferred dispositions and a verdict. Use for agent self-review or orchestrator review; never silently implement fixes.
---

# Review the actual snapshot

Read repository-root `AGENTS.md`, the task or final-review request, `docs/PRD.md`, relevant `docs/ENGINEERING.md` and `docs/TESTING.md` sections, and `docs/templates/REVIEW.md`. Read supplied QA as a claim to verify, not proof by itself.

## Establish scope

Record base/HEAD and all relevant committed, staged, unstaged and untracked changes. Identify whether this is an implementer self-review, a separately launched reviewer, or the orchestrator's final check. Do not inspect an empty Git diff and conclude there is no work without checking untracked files.

Before findings, populate the review template's human-readable change summary. Trace every material task outcome to actual entrypoints and the QA evidence checked. Describe what the developer would accept in the PR, and call out missing, unexpected, out-of-scope or unverified changes. Do not copy the implementer's summary without checking the source.

## Inspect with independent lenses

- Intent: does behavior match PRD/task, ownership and agreed exclusions?
- Data/security: are session authority, public payloads, validation, constraints and request-ID conflict handling correct?
- Ordering/failure: do concurrent retries, socket-before-HTTP, stale selection, targeted rollback, reconnect catch-up and Redis outages behave correctly?
- Integration/UX: do proxy/runtime boundaries, real map interaction, loading/error states, keyboard controls and mobile layout work as claimed?
- Proof: could the tests detect the defect, were relevant suites collected, and does evidence describe this snapshot?

Apply relevant lenses directly; do not spawn reviewer agents. Reopen cited code and check callers before reporting a finding. Separate confirmed defects from unverified concerns, intentional tradeoffs and excluded features. Do not require new architecture merely because another repository uses it.

## Write and hand off

For each actionable finding give severity, triggering scenario, user/system impact, actual file:line, evidence and a concrete correction. Record fixed/deferred/rejected findings with reasons; mark fixed only after inspecting the correction and regression evidence. State coverage limits and independently rerun checks versus supplied output.

Use the assigned report path and the review template. A final assessment report covers integrated code and links full-suite evidence, not only isolated PRs. Give a verdict of ready for developer review, changes required, or blocked. `Ready` requires a complete plain-language change summary and disposition for every finding, so the developer can read what changed before commit. No code fixes, commits, PR publication or merges during a review-only run.
