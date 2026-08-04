---
name: underengineer
description: "[M] Find unnecessary complexity in a plan and show what can go."
disable-model-invocation: true
---

# Underengineer

Review the current plan or proposed solution without changing or implementing it.
If the user supplies a target, review that target.
Otherwise, review the most recent plan or proposed solution in the conversation.
If no clear target exists, ask the user for one and stop.

## Terms

A **current requirement** is observable behavior that the solution must provide now.
A **current constraint** is an accepted decision or applicable rule that limits the solution now.
A **future possibility** is behavior that might become useful but is not currently required.
A **complexity item** is a proposed element that adds work or makes the solution harder to understand, change, verify, or operate.
Complexity items include extra scope, concepts, indirection, dependencies, states, configuration, compatibility behavior, and operational machinery.

Apply the instruction precedence from the current agent context.
Within that precedence, use explicit user statements, project instructions, accepted decisions, and current repository evidence.
If these sources conflict, report the conflict instead of choosing one silently.

## Verdicts

- `REMOVE`: Deleting the complexity item preserves every current requirement and current constraint.
- `SIMPLIFY`: The complexity item serves a current requirement or current constraint, but a simpler alternative serves it fully.
- `KEEP`: Removing or simplifying the complexity item would violate a current requirement or current constraint.
- `UNCLEAR`: Missing or conflicting information can change the verdict.

## 1. Establish what must remain

Identify each current requirement, current constraint, future possibility, and unresolved conflict.
For the final `What must remain`, include only requirements and constraints whose loss could change a verdict.
Do not report a future possibility unless the proposal relies on it to justify complexity.

This step is complete when every stated need is classified and the preservation boundary is explicit.

## 2. Challenge each complexity item

List each complexity item in the proposal.
Use this mandatory comparison table with one row per item:

| Item and effect | Simplest supported treatment | Verdict |
| --- | --- | --- |

Keep each cell concise.
Include a cost in `Item and effect` only when it changes the decision.
For `REMOVE`, state the direct solution or deletion.
For `SIMPLIFY`, state the simpler alternative.
For `KEEP`, state why removal would violate what must remain.
For `UNCLEAR`, state the exact missing or conflicting information.
If no complexity item exists, state `None identified` instead of creating an empty table.

Prefer deletion or a direct solution over new machinery.
A future possibility does not justify present complexity.

This step is complete when every complexity item has one supported verdict.

## 3. Recommend the simplest coherent solution

Describe the smallest solution that preserves every current requirement and current constraint.
Present it as one coherent proposal instead of repeating the table's verdict inventory.
If an `UNCLEAR` verdict blocks the recommendation, ask only the questions that can resolve it.

This step is complete when the recommendation preserves the full preservation boundary and the table accounts for every complexity item.

Return exactly these sections in this order:

1. `Simplest version`
2. `What must remain`
3. `Complexity check`
4. `Open questions` only when an `UNCLEAR` verdict or unresolved conflict remains.

Start `Simplest version` with one direct recommendation.
Under `What must remain`, use one concise bullet list.
Distinguish requirements from constraints only when the distinction changes a verdict.

The review is complete when the user can choose the simpler version without reconstructing the analysis.
