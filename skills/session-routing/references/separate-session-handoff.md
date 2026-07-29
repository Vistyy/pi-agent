# Separate-Session Handoff

Read this reference after selecting a separate-session handoff.

## 1. Confirm the handoff

Propose the handoff before launching it unless the user already requested the handoff.
Confirm whether the separate session will own the current outcome or independent work.

This step is complete when the user has approved or requested the handoff and the transferred outcome is explicit.

## 2. Create the handoff file

Create a compact handoff file that contains only:

- the owned outcome;
- accepted decisions and constraints;
- exact Task, Change, session, or repository identifiers;
- authoritative paths and evidence locations;
- unresolved questions;
- the verification state.

Do not copy exploratory dialogue, superseded options, or full file contents into the handoff.
Choose a concise kebab-case session name that identifies the owned outcome.
Do not use generic names such as `agent`, `session`, or `handoff`.

This step is complete when the handoff file identifies one outcome and contains only context needed by the new owner.

## 3. Launch the session

Run the session launcher:

```sh
node "${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}/skills/session-routing/scripts/start-separate-session.mjs" \
  --name <session-name> \
  --cwd <destination-directory> \
  --handoff-file <handoff-file>
```

When the handoff transfers the current outcome, add `--focus` and stop work on that outcome in the current session.
When the handoff transfers independent work, keep the current session focused on its outcome.

The launcher creates a new Herdr workspace.
The launcher uses the session name as the workspace label and Pi session name.
The new workspace contains the launched Pi session instead of adding a pane to the current workspace.
The launcher uses the default Pi configuration and starts a new session without continuing, resuming, or forking an existing session.

Inspect the structured result.
If the launcher fails, report the failure instead of claiming that the handoff succeeded.

This step is complete when the launcher reports a verified Pi session and the current session follows the confirmed ownership boundary.
