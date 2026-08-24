---
name: underengineer
description: "[M] Rethink the current explanation or proposed solution and remove unsupported assumptions and unnecessary complexity."
disable-model-invocation: true
---

# Underengineer

Review the diagnosis, explanation, plan, or proposed solution that the user identifies.
Otherwise, review the most recent one in the conversation.
If no clear target exists, ask the user for one and stop.
Do not change or implement it.

## Establish what must remain

Separate established facts from interpretations and proposed causes.
Identify the required outcome, current requirements, and current constraints whose loss could change the result.
Report conflicts instead of resolving them silently.
Do not treat a proposed structure, generic quality concern, future possibility, example, or missing information as a current requirement or constraint.

## Produce the simplest supported result

Optimize for the simplest supported final state of the system, not the smallest or easiest immediate change.
Prefer a larger change when it removes unnecessary structure and leaves the resulting system simpler.
Identify the assumptions, distinctions, guarantees, scope choices, and proposed elements that make the target more specific or complex.
For each one, ask what rules out a weaker explanation, direct solution, or existing owner.
Remove or weaken it when nothing does.
Do not assume a broader common cause when the evidence supports only the specific case.
A future possibility does not justify present complexity.

Prefer the least specific explanation that accounts for every established fact.
Prefer deletion or a direct solution over new concepts, indirection, dependencies, states, configuration, compatibility behavior, or operational machinery.
Preserve required reliability, safety, compatibility, verification, and coverage of material risks.

## Present the result

Return these sections in order:

1. `Simplest version`
2. `What must remain`
3. `Remove or reconsider` only when material unnecessary or unsupported items remain

Start `Simplest version` with one direct recommendation and present one coherent revised result.
Under `What must remain`, use a short bullet list containing only facts, requirements, and constraints whose loss could change the result.
Under `Remove or reconsider`, include at most the three highest-impact items and give one brief reason for each.
Group related items instead of listing every commitment separately.
If missing or conflicting information prevents a supported result, include the exact unresolved question as one of those items.

The review is complete when the proposed result contains no identified unsupported specificity or unnecessary complexity, preserves what must remain, and exposes each unresolved issue that can materially change it.
