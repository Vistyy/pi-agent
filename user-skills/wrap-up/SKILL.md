---
name: wrap-up
description: "[M] Audit the current session for unanswered questions, unfinished work, displaced discussion threads, and decisions that still need closure."
disable-model-invocation: true
---

# Wrap Up

Audit the current session for material open loops before the session ends.
Do not change files, mutate external state, or continue implementation unless the user separately authorizes that work.

## Reconstruct the session

1. Review the conversation from the oldest available turn through the current turn.
2. Identify each user request, question, proposed decision, authorized action, and material branch from another topic.
3. For each thread, identify its latest state and the evidence that closed it or left it open.
4. Inspect available task or tool state when the conversation indicates that work might still be running, interrupted, failed, or awaiting a result.
5. Trace each branch back to its parent topic so that a completed branch does not hide an unresolved parent topic.

Treat a thread as closed when one of these outcomes is clear:

- The question received a direct answer.
- The authorized action was completed and any required verification result was reported.
- The user accepted or rejected a material proposal or decision.
- The user explicitly cancelled, superseded, or deferred the thread.

Treat a thread as open when any of these conditions applies:

- A user question or request has no substantive response.
- Discussion moved to a branch before its parent topic reached an outcome.
- A material proposal still requires acceptance, rejection, or another stated choice.
- The assistant committed to an action that did not complete.
- Relevant work failed, was interrupted, is still running, or has a result that was not reconciled.
- A completion claim depends on required evidence that was not obtained or reported.

Do not treat silence as approval or rejection.
Do not demand explicit approval for an informational answer, an already authorized action, or a local and reversible implementation choice.
Do not reopen a settled topic without new evidence.
Do not invent follow-up work merely because further improvement is possible.

## Report the audit

Report these sections in this order and omit an empty optional section:

1. **Open loops** - For each material open thread, state the topic, the latest established state, what remains unresolved, and the smallest next step that could close it.
2. **Deliberately deferred** - List threads that the user explicitly deferred when remembering them is useful.
3. **Closed threads** - Briefly identify completed parent topics or branches only when this helps explain why another thread remains open.

If no material open loop remains, say: **No material open loops found in the available session.**

If any earlier portion of the session is unavailable or only summarized, state that limitation and do not claim that the audit covers more than the available record.
If an open loop remains, finish with one focused question or proposed action that addresses the most immediate closure point, then wait for the user.
