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
- **Settled decision**: A plan, specification, ADR, or user answer establishes it.
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

Use an open narrowing question only when the evidence supports no recommendation.
State why no recommendation is available.
Keep rejected mechanisms rejected unless new evidence invalidates the rejection.

## Complete the plan

A grilling session produces an approved plan.
A request to `continue` or `proceed` advances the planning session.

The plan is ready when:

- Every behavior required before implementation is explicit.
- Material constraints and dependencies are explicit.
- Each unresolved choice can be made during implementation without changing agreed behavior or another module's contract.
- Each unresolved choice can be reversed within the current task.

Summarize only the plan created or changed during this session.
Ask the user to approve that plan.
Record the approved plan.

Recommend `/skill:to-spec` when the approved plan needs a specification.
Recommend `/skill:to-tasks` when an approved specification needs task decomposition.
Stop after the recommendation.
