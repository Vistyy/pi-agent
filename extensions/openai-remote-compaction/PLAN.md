# OpenAI Remote Compaction Plan

Status: Approved

## Scope

The extension must support only Pi models whose provider is `openai-codex`.
The extension must use the existing Codex subscription authentication from Pi.
The extension must not implement direct OpenAI API, Azure, custom WebSocket, or `previous_response_id` support.
Fresh sessions that use another provider must retain normal Pi behavior.

## Location

The extension must live at:

```text
~/.pi/agent/extensions/openai-remote-compaction/
```

The implementation may use the reference `pi-openai-server-compaction` project as technical guidance and test evidence.
The implementation must not copy source code from that project.

## Remote compaction

The extension must handle Pi's existing automatic and manual compaction triggers.
The extension must not introduce another compaction threshold.

Before remote compaction, the extension must capture the stable settings from the latest Codex provider request.
The captured settings must include instructions, tools, reasoning settings, and text settings.
The extension must not copy old input, response IDs, streaming settings, or storage settings into the compaction request.
If no Codex request template is available, remote compaction must fail without changing the session.

The remote compaction request must use `store: false`.
The remote compaction request must include the active remote checkpoint, the visible tail, and a compaction trigger.
The extension must use Pi's `compaction.keepRecentTokens` setting for the visible tail.

The saved Pi compaction entry must contain this plaintext summary:

```text
Earlier context is stored in an OpenAI remote checkpoint and is unavailable to this model.
```

The saved Pi compaction entry must store the remote checkpoint in `details.openaiRemoteCompaction`.
The stored format must have a version number.
The stored data must include the replacement history, creating model ID, compaction compatibility hash, and continuation request settings.

The extension must reconstruct the active remote checkpoint from the active Pi session branch after resume, reload, tree navigation, and native Pi session forks.
Repeated remote compaction must include the previous remote checkpoint in the next remote compaction request.

## Failures

Remote compaction must make at most three total attempts.
The extension must retry network failures, rate limits, and server errors.
The extension must respect `Retry-After` when OpenAI provides it.
The extension must not retry authentication errors or invalid requests.

If all attempts fail, the extension must leave the session unchanged.
The extension must not silently replace remote compaction with Pi compaction.

The `/compact-pi` command must warn that older remote history cannot be included.
After user confirmation, `/compact-pi` must run Pi's normal compaction on the visible Pi context.
A successful `/compact-pi` operation must end the active remote checkpoint chain.

The normal `/compact` command must run remote compaction.
`/compact <instructions>` must report that custom compaction instructions are unsupported.

## Model compatibility

The extension must fetch and cache model metadata from the official Codex model catalog.
The extension must resolve Codex OAuth through Pi.
The extension must compare models with the catalog's `comp_hash` value.

A compatible Codex model may reuse the active remote checkpoint.
If the catalog is unavailable, the creating model may continue with its own remote checkpoint.
A different model must have a known matching compaction compatibility hash before it can reuse the remote checkpoint.

When the user selects an incompatible model, the extension must show a notification.
The extension must not block or revert the model selection.
The extension must omit the incompatible remote checkpoint from that model's request.
The incompatible model may continue with the visible tail.

A temporary incompatible-model turn must not delete the active remote checkpoint.
If the user returns to a compatible Codex model before another compaction, the extension must restore the remote checkpoint and include the intervening plaintext messages.

If an incompatible model reaches a compaction trigger while a remote checkpoint remains active, the extension must block that compaction.
The extension must tell the user to select a compatible Codex model or run `/compact-pi`.

If a session has a normal Pi compaction and later switches to Codex, the next Codex compaction may begin a new remote checkpoint chain from the visible Pi context.

## Fork children

The first version must not change `pi-subagent`.
Fork children must continue to receive the existing best-effort filtered parent context and the explicit Fork task.
The extension must not pass remote checkpoints to Fork children.
A Fork task must include all context required for the delegated work.

Portable cross-provider handoff is outside the first version.

## Usage accounting

The remote compaction response usage must be stored in `CompactionEntry.usage`.
After Pi saves the compaction, the extension must append a `pi.usage.recorded` custom entry.
The custom entry must use schema version 1 and identify the extension as `openai-remote-compaction`.
The custom entry must identify the operation as `remote-compaction`.
This record must allow the existing `/cost` extension to include remote compaction usage.

## Configuration

The first version must not add an extension configuration file.
The extension must use Pi's existing settings and Codex authentication.

## Verification

Normal validation must run unit tests and type checking without network access.
Unit tests must cover request construction, session reconstruction, repeated compaction, retries, compatibility decisions, notifications, compaction guards, commands, and usage records.

Live Codex tests must be opt-in.
Live tests must cover initial compaction, repeated compaction, resume, tree navigation, compatible model switching, temporary incompatible turns, and remote failure behavior.
Live tests must verify that remote compaction requests use `store: false`.

Run the live tests during implementation.
Run the live tests again after material protocol changes or major Pi upgrades.
