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

List each current requirement and current constraint.
List future possibilities separately.
Identify missing or conflicting information that affects the review.

This step is complete when every stated need is classified as a current requirement, current constraint, future possibility, or unresolved conflict.

## 2. Challenge each complexity item

List each complexity item in the proposal.
For each complexity item, state in plain language:

- what it adds;
- which current requirement or current constraint supports it, if any;
- its cost;
- the simplest credible alternative;
- one verdict.

Prefer deletion or a direct solution over new machinery.
A future possibility does not justify present complexity.
For an `UNCLEAR` verdict, state the exact missing or conflicting information.

This step is complete when every complexity item has one verdict and the stated basis supports that verdict.

## 3. Recommend the simplest coherent solution

Describe the smallest solution that preserves every current requirement and current constraint.
State what the proposal should remove or simplify.
Explain each retained complexity item in one sentence.
If an `UNCLEAR` verdict blocks the recommendation, ask only the questions that can resolve it.

This step is complete when the recommendation preserves every current requirement and current constraint.
The recommendation must name every removal and simplification.
The recommendation must explain each retained complexity item.

Return these sections:

1. `What must remain`
2. `Complexity check`
3. `Simplest version`
4. `Open questions` only if needed

The review is complete when the user can choose the simpler version without reconstructing the analysis.
