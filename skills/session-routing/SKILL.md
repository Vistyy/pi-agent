---
name: session-routing
description: Use at the start of work when spawn_agent is available. Also use when the user requests a separate Pi session or when delegated work, ownership, evidence needs, or concurrency changes.
---

# Session Routing

Route work by outcome ownership and context relevance.
Do not use an arbitrary turn count as a routing boundary.

## Definitions

**Current outcome** identifies the observable result that the current session owns.

**Subagent delegation** assigns bounded evidence gathering to a worker and returns the result to the session owner.
The session owner retains the current outcome and its decisions.

**Separate-session handoff** assigns an outcome to another Pi session.
The separate session owns the handed-off outcome and does not return its working context to the current session.
A handoff can transfer independent work or the current outcome.

## 1. Identify the current outcome

State the current outcome before routing work.
If the outcome is unclear or has materially changed, confirm the outcome with the user.

This step is complete when one observable result defines the current session's ownership.

## 2. Select the route

Before the current session performs broad evidence gathering, determine whether an owning area, an exact source, or a precise search anchor is known.
When none is known and a worker can interpret the assignment without most of the current session's relevant context, use subagent delegation for bounded orientation.
Treat investigation across multiple plausible sources as context gathering even when that investigation directly supports the current outcome.

Keep work in the current session when an owning area, an exact source, or a precise search anchor is known and the work directly produces the current outcome.
Keep work in the current session when a worker would need most of the current session's relevant context to interpret the evidence.
Keep persistent edits, problem framing, hypotheses, decisions, and user communication with the session owner unless the assignment explicitly transfers them.

Use subagent delegation for other bounded context gathering, verification, review, or experiments that the session owner needs before making a decision.

Use a separate-session handoff when the work has an independent outcome, needs its own user dialogue, or would add mostly irrelevant context to the current session.
A separate-session handoff may transfer the current outcome when a compact handoff can discard a substantial part of the accumulated context.
Continue the current session when the new session would need to reread most of the same evidence.
Do not use a returning subagent for work whose full lifecycle belongs in a separate session.

This step is complete when one route has a stated outcome owner and a context-relevance reason.
When no owning area, exact source, or precise search anchor was initially known, completion also requires delegated orientation or a stated reason that the worker would need most of the current session's relevant context.

## 3. Execute the route

When the selected route is subagent delegation, read [Subagent delegation](references/subagent-delegation.md) before spawning a worker.
When the selected route is a separate-session handoff, read [Separate-session handoff](references/separate-session-handoff.md) before creating or launching the handoff.
When the selected route is the current session, continue work on the current outcome.

This step is complete when the selected route's referenced completion criteria are satisfied or current-session work has continued.

## 4. Recheck scope changes

When new work appears, compare its outcome with the current outcome.
If the new work is only loosely related, tell the user and recommend a separate-session handoff before investigating it.
If the new work blocks the current outcome, route only the blocking evidence or experiment back to the current session.

This step is complete when discovered work either remains within the current outcome or has an explicit owner outside it.
