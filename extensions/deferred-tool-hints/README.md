# Deferred tool hints

Pi 1.0.0's `tool_search` description no longer lists tool namespaces. This extension keeps deferred capabilities visible without advertising their full schemas.

For example, a fresh session in this repository shows:

```text
Use tool_search to find tools from these sources:
- peer-sessions: Start an independent Pi agent in Herdr.
- code-review: Open and annotate committed diffs in Tuicr.
```

The extension derives these lines from registered deferred tools' namespace metadata. Tools sharing a namespace produce one hint. Only the first description line is shown. The `before_agent_start` hook owns the `deferred_tools` context section and emits it only when `tool_search` is selected.

## Design

The tool registrations own capability names and descriptions. This extension owns their upfront presentation. It does not register tools, activate them, or change schemas. Pi's built-in search still loads the full definitions.

A static list in `AGENTS.md` would duplicate the registration metadata. Adding this behavior to the compact skill catalog would combine unrelated responsibilities. A separate extension uses the same public context-section hook as the compact skill catalog and keeps both concerns separate.

The hints can remain visible after discovery. Restart activation behavior belongs to Pi, not this extension.

## Verification

`extensions/tuicr-review/tests/discovery.test.ts` loads this extension through Pi's SDK, runs a prompt against an isolated fixture provider, and checks the model-facing context and subsequent discovery. Native CLI verification uses the built Nix Pi package without invoking peer or review executors.
