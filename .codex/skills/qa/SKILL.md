---
name: qa
description: Verify a task or integrated application with ordered checks and reproducible QA evidence, distinguishing mocks, real services, Chromium and real Google OAuth. Does not authorize application fixes.
---

# Verify behavior, record evidence

Read repository-root `AGENTS.md`, the task, `docs/TESTING.md` completely, relevant `docs/ENGINEERING.md` sections, and `docs/templates/QA.md`. Confirm whether this is implementer QA or a separately launched verification run.

1. Record scope, worktree/branch, task base/HEAD, dirty-file inventory, timestamp, environment and isolated service identifiers. Identify existing failures and whether code edits are actually authorized.
2. Inspect package scripts and test collection. Run ESLint, TypeScript, backend Jest unit/integration, frontend Jest/RTL, production build, then Chromium as applicable. Diagnose a failed early gate before proceeding. Explain docs-only N/A; do not waive missing feature tests.
3. Inspect collected counts and selected files, not just exit status. Empty suites, ignored integration folders, fake coverage and a waiver-returning script cannot establish correctness.
4. Test task acceptance and failure paths with reproducible setup/action/expected/actual results. Select optimistic/realtime/auth/Redis cases from the testing contract according to changed behavior.
5. Label mocked component tests, real database/Redis tests, browser checks and provider smoke separately. A fixture session proves no Google login. A static review proves no browser interaction.
6. Update the separate QA document with PASS/FAIL/BLOCKED/NOT_RUN/N/A, exact commands, counts, sanitized output or artifact links, and required follow-up. Do not retain credentials or unredacted session traces.

Report fixes needed instead of implementing them during QA-only work. If fixes are authorized, invalidate stale evidence and rerun affected gates. Leave task acceptance unchecked when proof is missing; never commit, stage, start agents or mutate unrelated services to complete QA.
