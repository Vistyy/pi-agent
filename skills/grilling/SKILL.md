---
name: grilling
description: Use when the user wants to stress-test a plan or design before implementation, or uses a `grill` trigger phrase.
---

# Grilling

Use progressive elaboration to test a plan before implementation.
First, identify the plan's major decisions and constraints.
Then investigate each material unresolved point that requires a shared decision.

## Maintain a decision ledger

Classify information as:

- **Fact**: Repository evidence or authoritative documentation establishes it.
- **Settled decision**: An accepted plan, accepted specification, ADR, or user answer establishes it.
- **Open point**: A material gap, conflict, or choice remains unresolved.

Treat facts and settled decisions as constraints.
Ask the user only about open points.
After the user resolves an open point, record it as a settled decision for the rest of the session.
When investigating implementation mechanisms, preserve the settled behavior.

## Run each turn

1. Select one material open point.
2. Inspect the code and documentation that could resolve it as a fact.
3. If a choice remains, give the strongest supported recommendation and its reason.
4. Ask exactly one self-contained question.
5. Wait for the user's answer.

Use an open narrowing question only when bounded inspection supports no recommendation.
State the evidence limit, and do not repeat the inspection without new evidence.
Do not revisit a rejected mechanism unless new evidence or the user reopens it.
If the user asks to stop planning, stop and report the current decision ledger, unresolved open points, and approval status.
Stopping preserves the current approval status unless the user explicitly abandons the plan or withdraws approval.

## Complete the plan

A request to `continue` or `proceed` advances the planning session.

The plan is ready when:

- Every behavior required before implementation is explicit.
- Material constraints and dependencies are explicit.
- Each unresolved choice is local to the implementation and can be reversed without changing agreed behavior or another module's contract.

Summarize only the plan created or changed during this session.
Ask the user to approve that plan.
If the user declines the plan, record the feedback as open points and ask whether to revise it or stop.
Continue only when the user requests revision or continuation.
Record the plan as approved only after the user explicitly approves it.
