---
name: prompt-refiner
description: Refine or translate a rough Romanian or English instruction into a faithful, self-contained English prompt when the developer explicitly requests prompt refinement or a manual-agent handoff. Never executes the described work or invents scope.
---

# Refine an agent prompt

Treat the user's wording as intent, not text to translate literally. The output must be clear English suitable for an agent that cannot see the conversation.

1. Preserve the requested outcome, scope, technical choices, paths, identifiers, commands, model, authority and stopping point.
2. Read a referenced file only when necessary to represent it accurately. Do not turn adjacent repository context into new requirements.
3. Remove repetition and clarify ordering. Never add features, deadlines, acceptance claims, permissions, commits, agents, or architectural decisions that the user did not provide or approve.
4. For a short request, return one polished prompt. For a task or sprint handoff, use only the useful sections among: **Goal**, **Context**, **Scope**, **Constraints**, **Verification**, and **Stop condition**.
5. If ambiguity materially changes execution, state one to three explicit assumptions or open questions after the prompt. Do not silently guess. If the input is too sparse for a faithful prompt, ask for the missing intent.

Keep proper nouns, file paths, code, IDs, and command names exact. If the input is already clean, self-contained English, return it unchanged with a brief note. Do not perform the task described by the refined prompt or modify project files as part of refinement.
