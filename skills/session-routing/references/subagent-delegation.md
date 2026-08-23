# Temporary Managed Agent Delegation

## 1. Prepare the assignment

Identify one factual evidence question that the main-session reasoning must resolve.
Assign it as one bounded read-only evidence question about how a specific component, operation, invariant, or source relationship behaves before consuming the detailed source context in the main session.
Partition work by behavior or claim, never into implementation, test, and documentation branches.
Do not bundle unrelated concerns or ask an agent to assess, plan, or recommend for the overall outcome.
Scope each task by its question rather than by the number of connected sources it may require.
State the requested result, relevant starting anchors and constraints, and a stopping condition when one is useful.
Add output requirements only when the task needs them.
Do not explore the delegated sources to prepare the assignment or ask the agent to override its read-only boundary.
Keep the overall investigation, plan, design choice, final recommendation, implementation, verification, consequential decisions, synthesis, and user communication in the main session.
Give concurrent agents disjoint scopes unless independent corroboration is intentional.
Pass the skills that match the assignment when the delegation interface supports them.

This step is complete when the assignment has one owner and defines the required result and scope.

## 2. Coordinate the work

Do not duplicate a delegated scope, inspect another evidence branch for the same outcome, or poll agent status.
When the report contributes to the current answer, plan, decision, or implementation, finish the parent turn after dispatch.
Continue only a separate user-requested outcome that cannot affect or be affected by the report.
Send context-local follow-up work to the same agent.
Use another agent only for a separate scope or intentional independent corroboration.

This step is complete when every active scope has one owner.

## 3. Apply the report

Evaluate and connect the report with the other evidence needed for the main-session decision.
Do not merely repeat the report or re-read delegated sources.
Inspect an exact delegated source only when an exact conflict or synthesis question requires it.
Treat a stopped assignment with a clear evidence limit or parent question as a valid result.
For a material source-local gap likely to be resolved by follow-up, send the same agent one bounded follow-up with an explicit stopping condition.
End at resolution or the stopping condition; if the gap remains, report its evidence limit, and do not extend the follow-up for unrelated evidence.
Inspect an exact source in the main session only when synthesis or conflicting evidence requires it.
Do not repeat delegated exploration.

This step is complete when the main session can integrate the result or has reported each unresolved material gap and its evidence limit.
