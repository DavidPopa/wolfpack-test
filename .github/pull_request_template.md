## Outcome and scope

<!-- What changed, why, and which PRD/task requirement it satisfies. -->

Task: <path>
QA: <path>
Written review: <path>
Dependencies / base: <values>

<!-- SPRINTS packets are local and ignored. Summarize their outcome/evidence here or link a durable report/CI run; do not leave inaccessible local paths as the only proof. -->

## Verification

<!-- Exact tested commit/snapshot, commands, outcomes, test counts and evidence. Distinguish local checks from PR CI; explain blocked/not-run/N/A gates. -->

- [ ] ESLint and TypeScript
- [ ] Backend Jest unit and integration
- [ ] Frontend Jest / React Testing Library
- [ ] Production build and Chromium E2E
- [ ] Relevant manual checks, with real OAuth separate from fixtures
- [ ] Scope and written review checked by the orchestrator

## Risks and setup

<!-- Environment/migration requirements without secrets, known limitations, deferred findings with reasons, and integration checks still required. -->

The developer commits and pushes, or explicitly authorizes the orchestrator to perform a specific reviewed commit/push. Execution agents never do so. PR publication and merge remain developer-owned unless separately authorized. Local success does not establish PR CI success.
