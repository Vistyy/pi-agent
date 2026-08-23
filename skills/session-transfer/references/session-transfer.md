# Session Transfer

## 1. Confirm ownership

Propose the Session transfer before launching it unless the user already requested it.
Confirm whether the new session will own independent work or the current outcome.

This step is complete when the user has approved or requested the Session transfer and the transferred outcome is explicit.

## 2. Create the transfer brief

Create a compact transfer brief containing the context required to own the outcome.
Include the applicable information:

- the owned outcome and success criteria;
- accepted decisions, constraints, and authority;
- relevant identifiers, authoritative paths, and evidence locations;
- required output or user communication;
- unresolved questions;
- the current verification state.

Exclude exploratory dialogue, superseded options, irrelevant context, and full file contents.
Choose a concise descriptive kebab-case session name.
Do not use a generic name such as `agent-session` or `new-session`.

This step is complete when the brief gives the new session sufficient context to own one outcome.

## 3. Launch and verify the session

Run the session launcher:

```sh
node "${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}/skills/session-transfer/scripts/start-separate-session.mjs" \
  --name <session-name> \
  --cwd <destination-directory> \
  --transfer-file <transfer-file>
```

The launcher creates the Herdr workspace with `--no-focus` and does not focus the new session.
Keep the current session focused regardless of whether the transfer moves independent work or the current outcome.
When the Session transfer moves the current outcome, stop work on that outcome in the current session after the verified launch.

Inspect the structured launcher result.
If the launcher fails or does not verify the Pi session, report the failure and do not claim success.

This workflow is complete when the launcher reports a verified Pi session and the current session respects the ownership transfer.
