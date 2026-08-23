---
name: session-routing
description: Use when deciding whether work stays in the current session, goes to a temporary managed agent, or transfers to a separate Pi session.
---

# Session Routing

Route by outcome ownership and by how much detailed working context the outcome requires.
Do not route by an arbitrary turn count.

## Roles

**Main session**: Owns the user outcome, problem framing, cross-cutting decisions, synthesis, and user communication.

**Temporary managed agent**: Performs one bounded, read-only supporting task and returns evidence for parent evaluation.
Its scope is defined by the question, not the number of sources it inspects.
The main session retains consequential decisions and synthesis.

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

When the main session needs factual evidence, choose its collection route before consuming detailed context.
Inspect directly when the required evidence is small and local.
Use a temporary managed agent when the evidence question is independently answerable and its retrieval is source-heavy, specialized, parallelizable, or likely to crowd the main session with details that its reasoning does not need.

Give each temporary agent one bounded factual evidence question about how a specific component, operation, invariant, or source relationship behaves.
Partition work by behavior or claim, never into implementation, test, and documentation branches.
Do not bundle unrelated concerns or ask an agent to assess, plan, or recommend for the overall outcome.
Use one batch for non-overlapping local questions whose reports are needed for the same parent reasoning step.
Keep direct user interaction, implementation, final verification, outcome framing, consequential decisions, cross-cutting synthesis, conflict resolution, evidence integration, and the final response in the main session.
Do not duplicate delegated work, inspect another evidence branch for the same outcome, or poll helper status.
When the reports contribute to the current answer, plan, decision, or implementation, end the turn after dispatch.
Continue only a separate user-requested outcome that cannot affect or be affected by the reports.
After reports arrive, inspect an exact delegated source only when an exact conflict or synthesis question requires it.

Use a Session transfer when work has an independent outcome or the user transfers the current outcome.
For an agent-proposed transfer, obtain user approval before launching it.
Outcome ownership takes precedence over source location or known search anchors.

This step is complete when each scope has one owner and the main session retains the holistic decision.

## 3. Execute the route

For delegated work, read [Subagent delegation](references/subagent-delegation.md) before assigning the worker.

For a Session transfer, read [Session transfer](references/session-transfer.md) before launching it.

For current-session work, continue without loading a branch reference.

## 4. Integrate results

Evaluate and connect delegated evidence to make the main-session decision.
Do not merely repeat an agent report.
When new work introduces a different outcome or working set, choose its route before gathering detailed context.

This workflow is complete when the main session has made the required integrated decision and every unresolved material gap and its evidence limit are explicit.
