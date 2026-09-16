---
name: debug
description: Investigate a reproducible test failure, API or UI bug, auth issue, or optimistic/realtime race using causal evidence. Diagnosis-only requests stay read-only; fixes require assigned authority.
---

# Debug within authority

Read repository-root `AGENTS.md`, the assigned task, relevant `docs/ENGINEERING.md` sections and `docs/TESTING.md`. Establish diagnosis-only versus authorized fix before changing code.

1. Capture the symptom, exact environment/input, expected result and a reproducible failing signal. Check whether the command actually selected the test and used the intended server/database/worktree. Preserve the first useful error.
2. Trace the failing boundary from the real input through validation/auth, persistence, events and client state as relevant. Distinguish observation from hypothesis; inspect installed APIs instead of assuming reference-project behavior.
3. For races, reconstruct order using sanitized request/entity IDs: optimistic insertion, server write, event, HTTP response, current selection and retry. Do not log cookies, tokens or account secrets.
4. Test the smallest discriminating hypothesis. Change one causal variable at a time when practical; avoid repeated unchanged reruns or unrelated refactors. If evidence contradicts the hypothesis, update it rather than weakening the assertion.
5. In diagnosis-only work, deliver cause/evidence, uncertainty and a proposed fix task. When a fix is authorized, preserve a regression test, apply the scoped correction and rerun the failing signal followed by affected ordered gates.

If still blocked, report the strongest evidence, hypotheses ruled out, remaining unknown and the precise missing access/decision. Never bypass auth, silence errors, delete volumes, reset databases, stash user work or introduce fallback behavior just to turn a check green. Do not launch another agent or commit.
