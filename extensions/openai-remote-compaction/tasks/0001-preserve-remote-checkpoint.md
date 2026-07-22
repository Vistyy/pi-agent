# Codex sessions preserve a remote checkpoint

## Specification

[OpenAI Remote Compaction Specification](../SPEC.md)

## Behaviors owned

- Codex compaction creates a remote checkpoint chain through the `Solution` and `Compaction triggers` requirements.
- Remote requests preserve stable settings and use `store: false` through the `Request template` requirements.
- Pi persists a versioned remote checkpoint and visible tail through the `Remote checkpoint storage` requirements.
- Reload, repeated compaction, tree navigation, and native session forks reconstruct the active remote checkpoint through the `Remote checkpoint storage` requirements.
- Fresh non-Codex sessions retain normal Pi behavior through the `Non-Codex behavior` requirements.

## What to build

Deliver one end-to-end Codex session path that compacts remotely, saves the remote checkpoint, reloads, and continues from the saved checkpoint.
Use Pi's existing compaction preparation for the visible tail.

## Primary verification seam

A Pi extension lifecycle with a persisted `SessionManager`, provider-shaped requests, and mocked OpenAI HTTP.

## Acceptance criteria

- [ ] A Codex compaction sends the current context and trailing `compaction_trigger` with `store: false`.
- [ ] The saved compaction contains the marker, Pi's retained-tail entry ID, versioned remote details, and the OpenAI usage when available.
- [ ] A later request and repeated compaction replace the marker with the saved remote checkpoint.
- [ ] Reload and branch reconstruction select the active branch's remote checkpoint.
- [ ] A fresh non-Codex branch retains normal Pi behavior.

## Blocked by

None - can start immediately.
