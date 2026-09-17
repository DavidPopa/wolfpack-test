# Documentation and onboarding

Map Chat can be explored through the documentation directly or through one of the project-local interactive Codex skills.

## Interactive onboarding

Open `/skills` in Codex and select the appropriate project skill, or ask for it explicitly:

```text
Use $onboard-project for a quick read-only repository tour.
Use $onboard-developer for a day-one full-stack developer journey.
```

`onboard-project` is best for an evaluator, reviewer, or AI assistant that needs the product boundary, repository map, commands, runtime topology, verification gates, and documentation owners. It can also audit onboarding guidance, but it does not implement features.

`onboard-developer` is an interactive, role-aware journey. It can focus on full-stack, frontend, backend, QA, review, or AI-assisted contribution work and may be run as a quick tour, a day-one path, or a deeper walkthrough. It pauses between meaningful stages and ties concepts to current owner files.

Both skills default to read-only onboarding. They do not grant permission to install dependencies, operate containers, read secrets, change application code, or perform Git actions. Implementation still follows the approved sprint → task → QA → review workflow in [AGENTS.md](../AGENTS.md).

## Read the documentation directly

| Topic | Owner document |
| --- | --- |
| Final assessment traceability, evidence, findings, and reviewer checklist | [Final assessment review](FINAL_REVIEW.md) |
| Product scope and technical decisions | [Technical PRD](PRD.md) |
| Repository setup, architecture, and commands | [README](../README.md) |
| Engineering invariants and pitfalls | [Engineering notes](ENGINEERING.md) |
| Ordered verification and evidence boundaries | [Testing contract](TESTING.md) |
| Leaflet/Stadia provider decision and attribution | [Map provider decision](MAP.md) |
| Final evidence, limitations, and delivery status | [Delivery report](DELIVERY.md) |
| Agent authority and contribution workflow | [Agent workflow](../AGENTS.md) |
| Project-local Codex configuration and skills | [Codex setup](../.codex/README.md) |

For ordinary local setup, start with the root [README](../README.md). For a contribution, read `AGENTS.md` before opening a task packet. Local packets under `SPRINTS/phase-*` are working evidence and are intentionally not part of the submitted repository history.
