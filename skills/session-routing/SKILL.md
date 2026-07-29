---
name: session-routing
description: Use when subagents are available, delegated context changes, or the user requests a separate Pi session.
---

# Session Routing

Keep the main session responsible for holistic reasoning.
Keep detailed working context local to the agent performing the work.
Route by reasoning responsibility, working-context cost, and outcome ownership.
Do not route by an arbitrary turn count.

## Roles

**Main session**: Owns the user outcome, problem framing, accepted constraints, and cross-cutting decisions.
It performs synthesis and user communication.
It uses compact reports instead of accumulating each worker's raw working context.

**Subagent**: Owns one bounded question or deliverable and the detailed working context needed to complete it.
A subagent may explore, analyze, implement, verify, experiment, or review within that scope.
It returns a compact report to the main session but does not own the holistic judgment.

**Separate session**: Owns an independent outcome or an explicitly transferred current outcome.
It has its own user dialogue and does not return its working context to the current session.

## Invariants

Delegate working context, not holistic judgment.
The main session must frame the overall problem and integrate worker reports.
It must resolve cross-cutting trade-offs and make the final decision.

Give each bounded question or deliverable one owner.
While a subagent owns it, the main session must not independently gather evidence or perform the same work.
When the user explicitly requests independent corroboration, assign the same question to a separate subagent.
Use a separate session instead only when the user requests one.
Conflicting evidence can also require independent corroboration.
State the reason and the independent scope before assigning the additional owner.

Keep detailed context with the agent that already has it.
Send context-local follow-up work to the same subagent instead of importing its working set into the main session.

## 1. Frame the current outcome

State the observable outcome that the main session owns.
Identify the holistic decisions that must remain in the main session.
Do not search the repository or read multiple sources before making the routing decision.

If the outcome is unclear or requires a consequential user decision, ask the user before routing work.

This step is complete when the owned outcome, accepted constraints, and main-session decisions are explicit.

## 2. Route the work

Keep work in the main session when it uses context already present.
Also keep holistic framing, synthesis, and user communication in the main session.

Use a subagent when a bounded question or deliverable can be stated compactly.
For a broad question, keep the holistic question in the main session and delegate its bounded evidence needs.
Delegate work that requires repository exploration, multiple source reads, or command-output analysis.
Also delegate bounded experiments, implementation, verification, and review.
Delegate before gathering that detailed context in the main session.

Use a separate-session handoff when work has an independent outcome or requires its own user dialogue.
Also use a handoff when the user explicitly transfers the current outcome.
Before investigating a newly discovered independent outcome, obtain the approval required by the handoff reference.
Outcome ownership takes precedence over source location or known search anchors.

This step is complete when the main session retains holistic reasoning.
Each context-heavy or independently owned scope must also have one explicit owner.

## 3. Execute the selected route

For delegated work, read [Subagent delegation](references/subagent-delegation.md) before assigning the worker.

For a separate-session handoff, read [Separate-session handoff](references/separate-session-handoff.md).
Read it before creating or launching the handoff.

For current-session work, continue without loading a branch reference.

This step is complete when the selected route satisfies its branch-specific completion criteria.

## 4. Integrate results and route follow-up work

Use subagent reports as the main session's evidence source.
Perform the holistic reasoning that combines those reports with the user outcome and accepted constraints.

When a report needs more source-local investigation, continue the same subagent with the exact unresolved question.
Inspect an exact source in the main session only when the holistic decision requires it.
Inspection is also permitted to resolve consequential conflicting evidence or apply the reported result.

When new work introduces a different outcome or working set, return to the routing decision before investigating it.

This step is complete when the main session has made the required integrated decision.
Every unresolved scope must also have an explicit owner.
