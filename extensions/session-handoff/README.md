# Session handoff

The `start_session` tool starts an independent interactive Pi session in a new, unfocused Herdr workspace.

- `cwd` optionally selects its working directory. Absolute paths are used directly; relative paths resolve from the originating session's working directory. Omitting it keeps the originating directory.
- `forkContext: false` (default) creates a clean, parentless session.
- `forkContext: true` copies the exact active branch through the entry immediately before the invoking assistant entry. The `start_session` call and every sibling call in that assistant entry are excluded. A hidden boundary message marks the copied entries as inherited history so the destination does not repeat the handoff request.

After Herdr accepts the kickoff prompt, the tool returns the selected working directory plus the new workspace, tab, pane, agent, and Pi session identities. The originating session does not own, monitor, steer, close, or receive results from the new session.

The extension deliberately provides no session listing, messaging, supervision, or conflict detection.
