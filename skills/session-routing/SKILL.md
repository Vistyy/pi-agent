---
name: session-routing
description: Use when deciding whether work stays in the current session, goes to a subagent, or transfers to a separate Pi session.
---

# Session Routing

Route by outcome ownership and by how much detailed working context the outcome requires.
Do not route by an arbitrary turn count.

## Roles

**Main session**: Owns the user outcome, problem framing, cross-cutting decisions, synthesis, and user communication.

**Subagent**: Owns one bounded deliverable and the detailed working context needed to produce it.
It returns a compact result to the main session without owning the holistic judgment.

**Session transfer**: Gives an independent outcome or the current outcome to a new Pi session with its own user dialogue.

## Rules

Keep holistic judgment in the main session.
Give each bounded scope one owner, and do not duplicate an active owner's work.
Send context-local follow-up work to the agent that already has the working context.
Use independent corroboration only when conflicting evidence or material risk justifies the duplicate scope.
Launch a Session transfer only when the user requests or approves it.

## 1. Frame the outcome

State the observable outcome, accepted constraints, and decisions that the main session must retain.
Gather only the context needed to choose a route.
Ask the user when the outcome is unclear or requires a consequential decision.

This step is complete when the owned outcome and retained decisions are explicit.

## 2. Choose the route

Default to a subagent when one bounded deliverable can be stated compactly and its detailed working context can be compressed into a result sufficient for the main-session decision.
A subagent can explore, analyze, implement, verify, experiment, or review within that boundary.
Delegate before gathering the detailed context that the subagent will own.

Keep work in the main session only when it uses context already present without tools, requires direct user interaction, or cannot be assigned with a compact result contract.
Do not keep an otherwise eligible deliverable in the main session only because its evidence gathering is small or tightly coupled to the main decision.

Use a Session transfer when work has an independent outcome or the user transfers the current outcome.
For an agent-proposed transfer, obtain user approval before launching it.
Outcome ownership takes precedence over source location or known search anchors.

This step is complete when each scope has one owner and the main session retains the holistic decision.

## 3. Execute the route

For delegated work, read [Subagent delegation](references/subagent-delegation.md) before assigning the worker.

For a Session transfer, read [Session transfer](references/session-transfer.md) before launching it.

For current-session work, continue without loading a branch reference.

## 4. Integrate results

Integrate delegated results and explicit evidence limits into the main-session decision.
When new work introduces a different outcome or working set, choose its route before gathering detailed context.

This workflow is complete when the main session has made the required integrated decision and every unresolved material gap and its evidence limit are explicit.
