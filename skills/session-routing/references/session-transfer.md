# Session transfer

## 1. Confirm ownership

Propose the Session transfer before launching it unless the user already requested the Session transfer.
Confirm whether the new session will own independent work or the current outcome.
A Session transfer does not start a Change, Managed Worktree, or Implementer.

This step is complete when the user has approved or requested the Session transfer and the transferred outcome is explicit.

## 2. Create the transfer brief

Create a compact transfer brief with all context required to own the outcome.
Include the applicable information:

- the owned outcome and success criteria;
- accepted decisions, constraints, and authority;
- exact Task, Change, session, or repository identifiers;
- authoritative paths and evidence locations;
- required output or user communication;
- unresolved questions;
- the current verification state.

Exclude exploratory dialogue, superseded options, irrelevant context, and full file contents.
Choose a concise descriptive kebab-case session name.
Do not use a generic name such as `agent-session` or `new-session`.

This step is complete when the transfer brief gives the new session sufficient context to own one outcome.
The transfer brief must not reproduce irrelevant exploration.

## 3. Launch and verify the session

Run the session launcher:

```sh
node "${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}/skills/session-routing/scripts/start-separate-session.mjs" \
  --name <session-name> \
  --cwd <destination-directory> \
  --transfer-file <transfer-file>
```

When the Session transfer moves the current outcome, add `--focus` and stop work on that outcome in the current session.
When the Session transfer moves independent work, keep the current session focused on its own outcome.

Inspect the structured launcher result.
If the launcher fails or does not verify the Pi session, report the failure.
Do not claim that the Session transfer succeeded.

This step is complete when the launcher reports a verified Pi session.
The current session must also respect the confirmed ownership transfer.
