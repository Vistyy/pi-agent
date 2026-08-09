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

## Terms

An **established fact** is an observation supported by explicit user statements, applicable authority, or current evidence.

A **current requirement** is observable behavior that the result must provide now.

A **current constraint** is an accepted decision or applicable rule that limits the result now.

A **commitment** is an assumption, distinction, guarantee, scope choice, or proposed element that makes the explanation or response more specific.

A **complexity item** is a commitment that adds work or makes the result harder to understand, change, verify, or operate.
Complexity items include extra scope, concepts, indirection, dependencies, states, configuration, compatibility behavior, and operational machinery.

## Verdicts

- `REMOVE`: The commitment is unsupported or can be deleted while preserving every established fact, current requirement, and current constraint.
- `SIMPLIFY`: The commitment serves the result, but a weaker explanation or simpler treatment serves it fully.
- `KEEP`: Removing or weakening the commitment would conflict with an established fact, current requirement, or current constraint.
- `UNCLEAR`: Missing or conflicting information can change the verdict.

## 1. Establish what must be explained or preserved

State the observed problem or required outcome.
Separate established facts from interpretations and proposed causes.
Identify only the current requirements and current constraints whose loss could change the result.
Report conflicts instead of resolving them silently.
Do not treat a proposed structure, generic quality concern, future possibility, or missing information as a current requirement or constraint.

## 2. Remove unsupported specificity

Identify the commitments in the current explanation or response.
Include only commitments that are present in or necessarily implied by the target; do not invent one to populate the comparison table.
For each commitment, ask what rules out a weaker alternative.
Remove or weaken it when nothing does.
Prefer the least specific explanation that accounts for every established fact and remains compatible with possibilities the evidence has not ruled out.
Do not assume that a broader common cause exists when the evidence supports only the specific case.
State what additional evidence would be necessary to retain a more specific explanation when that distinction affects the result.

## 3. Remove unnecessary complexity

When a response or solution is proposed, test each complexity item against the established facts, current requirements, current constraints, and the least specific supported explanation.
Prefer deletion or a direct solution over new machinery.
A future possibility does not justify present complexity.
Retain a specific mechanism only when removing or simplifying it would violate what must remain.

Use this table with one row per independently decidable commitment:

| Commitment and effect | Simplest supported treatment | Verdict |
| --- | --- | --- |

Group items only when they have the same treatment and verdict.
Keep each cell concise.
For `REMOVE`, state the direct deletion.
For `SIMPLIFY`, state the weaker explanation or simpler treatment.
For `KEEP`, state what requires it.
For `UNCLEAR`, state the exact missing or conflicting information.
If no removable or questionable commitment exists, state `None identified` instead of creating an empty table.

## 4. Present one coherent result

Return exactly these sections in this order:

1. `Simplest version`
2. `What must remain`
3. `Underengineering check`
4. `Open questions` only when an `UNCLEAR` verdict or unresolved conflict remains.

Start `Simplest version` with one direct recommendation.
State the least specific supported explanation when the target includes a diagnosis or explanation.
State the simplest coherent response when the target includes a plan or solution.
When the target includes both, use the selected explanation to evaluate the response.

Under `What must remain`, use one concise bullet list.
Include only established facts, current requirements, and current constraints whose loss could change a verdict.

Under `Underengineering check`, include the comparison table or `None identified`.
Do not repeat the table as a second inventory.
If an `UNCLEAR` verdict blocks the result, ask only the questions that can resolve it.

The review is complete when the explanation contains no unsupported specificity, the response contains no unnecessary complexity, the result preserves every established fact, current requirement, and current constraint, and every verdict-changing unknown is explicit.
