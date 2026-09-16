---
name: qa
description: Verify a task or integrated application with ordered checks and reproducible QA evidence, distinguishing mocks, real services, Chromium and real Google OAuth. Does not authorize application fixes.
---

# Verify behavior, record evidence

Read repository-root `AGENTS.md`, the task, `docs/TESTING.md` completely, relevant `docs/ENGINEERING.md` sections, and `docs/templates/QA.md`. Confirm whether this is implementer QA or a separately launched verification run.

1. Record scope, worktree/branch, task base/HEAD, dirty-file inventory, timestamp, environment and isolated service identifiers. Identify existing failures and whether code edits are actually authorized.
2. Inspect the complete diff and untracked files. Populate the QA template's human-readable change audit by tracing every material task outcome to actual files/lines and observable behavior. Identify missing, unexpected, or out-of-scope changes before treating test output as acceptance evidence.
3. Inspect package scripts and test collection. Run ESLint, TypeScript, backend Jest unit/integration, frontend Jest/RTL, production build, then Chromium as applicable. Diagnose a failed early gate before proceeding. Explain docs-only N/A; do not waive missing feature tests.
4. Inspect collected counts and selected files, not just exit status. Empty suites, ignored integration folders, fake coverage and a waiver-returning script cannot establish correctness.
5. Test task acceptance and failure paths with reproducible setup/action/expected/actual results. Select optimistic/realtime/auth/Redis cases from the testing contract according to changed behavior.
6. Label mocked component tests, real database/Redis tests, browser checks and provider smoke separately. A fixture session proves no Google login. A static review proves no browser interaction.
7. Update the separate QA document with PASS/FAIL/BLOCKED/NOT_RUN/N/A, exact commands, counts, sanitized output or artifact links, and required follow-up. Make the change audit readable by the developer; do not substitute a raw file list. Do not retain credentials or unredacted session traces.

Report fixes needed instead of implementing them during QA-only work. If fixes are authorized, invalidate stale evidence and rerun affected gates. Leave task acceptance unchecked when proof is missing; never commit, stage, start agents or mutate unrelated services to complete QA.
