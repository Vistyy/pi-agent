# Architecture

## Scope

The extension handles remote compaction only for the `openai-codex` provider.
It uses Pi's Codex subscription authentication and the official Codex model catalog.
It does not support direct OpenAI API models, Azure OpenAI, custom WebSocket transport, or `previous_response_id`.

## Compaction lifecycle

The extension observes completed Codex provider requests and retains the stable request settings required for compaction.
These settings include instructions, tools, reasoning settings, and text settings.

When Pi prepares automatic or manual compaction, the extension builds a new request from the active session history.
The request includes the active remote checkpoint, the visible tail, and a trailing `compaction_trigger` item.
The request sets `store` to `false` and does not reuse response IDs, streaming settings, or previous input.

The extension sends the request to `POST https://chatgpt.com/backend-api/codex/responses` with the `remote_compaction_v2` beta feature.
It reads the returned compaction item and stores only its opaque encrypted content.

The Pi compaction summary contains this marker:

```text
Earlier context is stored in an OpenAI remote checkpoint and is unavailable to this model.
```

The extension stores versioned state under `details.openaiRemoteCompaction`.
The state contains the replacement history, creating model ID, known compatibility hash, and continuation settings.
Pi keeps the visible tail according to `compaction.keepRecentTokens`.

The extension reconstructs the active remote checkpoint from the active Pi branch.
This reconstruction supports resume, reload, tree navigation, native Pi session forks, and repeated remote compaction.

## Model compatibility

The extension ships the `comp_hash` metadata bundled with Codex 0.145.0 and refreshes it from the official Codex model catalog.
The catalog request includes the Codex client version.
The request keeps Pi's normal Codex authentication headers because Pi, rather than the Codex binary, is the calling client.
A remote catalog containing a listed model becomes the source of truth.
Otherwise, remote metadata overlays the bundled snapshot.
Model lookup follows Codex longest-prefix matching and its single-namespace suffix fallback.

Two known matching hashes establish compatibility.
Two known differing hashes establish incompatibility.
If either hash is missing, compatibility is unknown and checkpoint reuse remains enabled, matching Codex behavior.
A later successful compaction stores any newly resolved hash.

Selecting an incompatible model does not cancel or revert the selection.
The extension warns the user and sends that model the plaintext marker and visible tail.
The remote checkpoint remains active, so returning to a compatible Codex model restores the checkpoint and includes intervening plaintext messages.

The extension cancels compaction when an incompatible model is active over a remote checkpoint.
The user must select a compatible Codex model or run `/compact-pi`.

## Failure behavior

Remote compaction makes at most three total attempts.
It retries network failures, rate limits, and retryable server errors.
It respects `Retry-After` and Pi's abort signal.
It does not retry authentication failures or invalid requests.

A final failure does not save a compaction entry or change the active branch.
The existing remote checkpoint chain remains usable.
The extension does not fall back automatically because ordinary Pi compaction cannot read history stored only in a remote checkpoint.

The `/compact-pi` command provides an explicit fallback.
The command warns about remote-only history, requires confirmation, bypasses remote handling once, and invokes normal Pi compaction.
A successful Pi compaction ends the remote checkpoint chain.

## Usage accounting

When OpenAI reports usage, the extension maps it into `CompactionEntry.usage`.
After Pi saves the compaction, the extension appends a schema-version-1 `pi.usage.recorded` custom entry.
The entry identifies `openai-remote-compaction` as the extension and `remote-compaction` as the operation.
The extension does not import or call `pi-cost`.

## Validation

Offline tests use Pi's public `AgentSession` and extension resource loader with deterministic models and mocked HTTP responses.
They cover persistence, resume, request construction, compatibility, retries, commands, notifications, and usage records.

Live validation is opt-in because it uses the configured Codex subscription.
It covers initial and repeated compaction, resume, tree navigation, available compatibility paths, failure preservation, and `store: false`.
Run live validation after material protocol changes or major Pi upgrades.

## Updating Codex metadata

The bundled compatibility snapshot and `CODEX_CATALOG_CLIENT_VERSION` come from OpenAI Codex release 0.145.0 at revision `808d3c2702ce8eae007c457aa930e7c3b68dd5f6`.
When adopting a newer stable Codex release, compare `codex-rs/models-manager/models.json` and update the version, source revision, model slugs, and `comp_hash` values together.
Run offline and live validation after each snapshot update.

## Non-goals

The extension does not provide continuous plaintext summaries, portable cross-provider handoff, cross-hash checkpoint migration, automatic fallback, custom remote-compaction instructions, or extension configuration.
