---
name: session-routing
description: Use when coordinating work across agents or sessions, or when deciding whether work should stay in the current session, return from a subagent, or move to a separate Pi session.
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

Keep work in the current session when the work directly produces the current outcome and uses mostly relevant context.

Use subagent delegation when the current outcome needs bounded evidence before the session owner can make a decision.
Delegate context gathering, verification, review, or an experiment.
Keep problem framing, hypotheses, decisions, user communication, and persistent edits with the session owner unless the assignment explicitly transfers them.

Use a separate-session handoff when the work has an independent outcome, needs its own user dialogue, or would add mostly irrelevant context to the current session.
A separate-session handoff may transfer the current outcome when a compact handoff can discard a substantial part of the accumulated context.
Continue the current session when the new session would need to reread most of the same evidence.
Do not use a returning subagent for work whose full lifecycle belongs in a separate session.

This step is complete when one route has a stated outcome owner and a context-relevance reason.

## 3. Execute the route

For subagent delegation:

- Give each worker one self-contained task or falsifiable hypothesis.
- Give concurrent workers disjoint scopes.
- Select the skills that match the assignment.
- Pass those skills when the delegation interface supports them.
- If the next owner action depends on the evidence, wait for the worker.
- If an orthogonal owner action is available, continue that action while the worker runs.
- Do not use or reproduce delegated evidence before the worker responds.
- After the worker responds, investigate only consequential gaps, ambiguities, or conflicts.

For a separate-session handoff, propose the handoff before launching it unless the user already requested the handoff.
After the user approves or requests the handoff, create a compact handoff file that contains only:

- the owned outcome;
- accepted decisions and constraints;
- exact Task, Change, session, or repository identifiers;
- authoritative paths and evidence locations;
- unresolved questions;
- the verification state.

Do not copy exploratory dialogue, superseded options, or full file contents into the handoff.
Choose a concise kebab-case session name that identifies the owned outcome.
Do not use generic names such as `agent`, `session`, or `handoff`.

Run the session launcher:

```sh
node "${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}/skills/session-routing/scripts/start-separate-session.mjs" \
  --name <session-name> \
  --cwd <destination-directory> \
  --handoff-file <handoff-file>
```

When the handoff transfers the current outcome, add `--focus` and stop work on that outcome in the current session.
When the handoff transfers independent work, keep the current session focused.
The launcher uses the default Pi configuration and starts a new session without continuing, resuming, or forking an existing session.
Inspect the structured result and report a launch failure instead of claiming that the handoff succeeded.

This step is complete when the selected destination can act without ambiguous ownership or unnecessary prior context and the launcher reports a verified Pi session.

## 4. Recheck scope changes

When new work appears, compare its outcome with the current outcome.
If the new work is only loosely related, tell the user and recommend a separate-session handoff before investigating it.
If the new work blocks the current outcome, route only the blocking evidence or experiment back to the current session.

This step is complete when discovered work either remains within the current outcome or has an explicit owner outside it.
