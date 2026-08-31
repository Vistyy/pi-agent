---
name: wrap-up
description: "[M] Audit the current conversation for unresolved questions, undecided proposals, implicit assumptions, and discussion branches that lost their disposition."
disable-model-invocation: true
---

# Wrap Up

Audit the current conversation for material matters that never received a clear disposition before the session ends.
The purpose is conversational closure, not status monitoring for work that already has an owner and execution route.
Do not change files, mutate external state, continue implementation, or take over delegated work unless the user separately authorizes that action.

## Reconstruct the conversation

1. Review the conversation from the oldest available turn through the current turn.
2. Identify each user question, requested outcome, proposed decision, assumption requiring user authority, authorized action, and material discussion branch.
3. For each item, identify whether the conversation reached a decision, answer, completed action, explicit deferral, cancellation, supersession, or handoff to an accepted owner and execution route.
4. Trace branches back to their parent topic so that resolving a side question does not hide an unresolved parent question.
5. Inspect task or tool state only when evidence is needed to determine whether an authorized action received a disposition.
Do not inspect state merely to monitor work that was already handed off.

## Classify disposition

Treat an item as resolved for this audit when one of these outcomes is clear:

- The question received a substantive answer.
- The user accepted, rejected, superseded, or explicitly deferred a proposal.
- The user made the material decision that the discussion required.
- An authorized action completed and its material result was reported.
- Work was explicitly handed off to another agent, session, Task, Change, process, or other accepted owner with a supported execution route.
- A failure received a decision, recovery route, replacement, or explicit deferral.

A handoff is a disposition, not a claim that the delegated work is complete.
Do not classify delegated or separately executing work as an open loop merely because it remains in progress, awaits review, or may require later monitoring.

Treat an item as an open loop only when the conversation itself lacks a material disposition, including these cases:

- A user question or request has no substantive response.
- A proposal still requires acceptance, rejection, or another user decision.
- The assistant treated silence or an ambiguous response as approval for a material decision.
- Discussion moved to another branch before the parent question reached an answer or decision.
- The assistant committed to an action that neither completed nor received an explicit handoff, replacement, cancellation, or deferral.
- An action failed and the conversation never decided whether to recover, replace, cancel, defer, or hand it off.
- A completion claim depends on required evidence that was never obtained or reconciled.

Do not demand explicit approval for an informational answer, an already authorized action, or a local and reversible implementation choice.
Do not reopen a settled topic without new evidence.
Do not invent follow-up work merely because more work is possible.
Do not turn active Tasks, Changes, pull requests, background processes, or separate sessions into open loops when their ownership and route are already established.

## Report the audit

Lead with one of these conclusions:

- **Open loops remain.**
- **No material open loops found in the available conversation. This session can end.**

When open loops remain, list only the unresolved conversational matters under **Open loops**.
For each one, state what was discussed, where the conversation lost its disposition, and the smallest question or decision that would close it.
Finish with one focused question that addresses the most immediate open loop.

Then provide **Session disposition** as a short account of the overall thread.
State the main conclusions, decisions, completed actions, explicit deferrals, and material handoffs needed for the user to understand where the session ended.
Describe handed-off or separately running work as settled ownership, not as an open loop.
Do not produce a detailed status inventory unless it is necessary to explain an unresolved matter.

If useful, list explicit deferrals under **Deliberately deferred**.
Omit that section when empty.

If any earlier portion of the conversation is unavailable or only summarized, state that limitation and do not claim broader coverage.
