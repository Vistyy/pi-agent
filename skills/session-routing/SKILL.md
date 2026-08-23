---
name: session-routing
description: Use when deciding whether work stays in the current session, goes to a temporary managed agent, or transfers to a separate Pi session.
---

# Session Routing

Route by outcome ownership and by how much working context the outcome requires.
Do not route by an arbitrary turn count.

## Roles

**Main session**: Owns the user outcome, problem framing, consequential interpretation, cross-cutting decisions, synthesis, and user communication.

**Temporary managed agent**: Owns one bounded read-only supporting slice and returns a local result for parent evaluation.
The slice may require connected sources and local reasoning, but it does not own what its result means for the user outcome.

**Session transfer**: Gives an independent outcome or the current outcome to a new Pi session with its own user dialogue.

## Rules

Keep outcome ownership and holistic judgment in the main session.
Give each bounded slice one owner, and do not duplicate an active slice.
Send context-local follow-up work to the agent that already has the working context.
Use independent corroboration only when conflicting evidence or material risk justifies duplicate work.
Launch a Session transfer only when the user requests or approves it.

## 1. Frame the outcome

State the observable outcome, accepted constraints, and decisions that the main session must retain.
Gather only the context needed to choose a route.
Ask the user when the outcome is unclear or requires a consequential decision.

This step is complete when the owned outcome and retained decisions are explicit.

## 2. Choose the route

Keep work in the main session when it is tightly coupled to outcome framing, consequential interpretation, synthesis, implementation, final verification, or user communication.
Use a temporary managed agent when one bounded read-only supporting slice can return a useful local result without transferring those responsibilities and delegation provides a material benefit.
A slice is bounded by its requested result, not by an arbitrary number of sources or steps.
Use a Session transfer when work has an independent outcome or the user transfers the current outcome.
For an agent-proposed transfer, obtain user approval before launching it.
Outcome ownership takes precedence over source location or known search anchors.

This step is complete when each active scope has one owner and the main session retains the user outcome.

## 3. Execute the route

For delegated work, read [Subagent delegation](references/subagent-delegation.md) before assigning the worker.

For a Session transfer, read [Session transfer](references/session-transfer.md) before launching it.

For current-session work, continue without loading a branch reference.

## 4. Integrate results

Evaluate delegated results as inputs to the main-session decision.
Inspect material evidence when needed before relying on a report.
Do not merely repeat an agent report.
When new work introduces a different outcome or working set, choose its route before gathering detailed context.

This workflow is complete when the main session has made the required decision and every unresolved material gap is explicit.
