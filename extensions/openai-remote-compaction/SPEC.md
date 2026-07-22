# OpenAI Remote Compaction Specification

## Problem Statement

Pi currently uses plaintext summaries when a conversation reaches its context limit.
OpenAI Codex supports an opaque remote checkpoint that can preserve more usable context than a plaintext summary.
The available reference extension also supports direct API models, Azure, custom WebSocket transport, and continuous portable summaries.
Those features add cost and complexity that are not required for this Codex subscription workflow.

The user wants Codex remote compaction without a second uncached summarization request at every compaction.
The user also needs failed compaction to preserve the existing remote checkpoint chain.
Fresh non-Codex sessions must continue to use normal Pi behavior.

## Solution

Create a local Pi extension that replaces Pi compaction only for `openai-codex` models.
The extension asks OpenAI Codex to perform remote compaction and stores the returned remote checkpoint in the Pi compaction entry.
The extension keeps Pi's configured visible tail and stores a short plaintext marker for models that cannot use the remote checkpoint.

The extension uses the official Codex model catalog to identify compatible Codex models.
Compatible Codex models can reuse the active remote checkpoint.
Incompatible models can continue with the visible tail after a warning, but they cannot use the remote checkpoint.

The extension never performs an automatic plaintext fallback after remote compaction fails.
The extension provides `/compact-pi` as an explicit destructive escape hatch.

The extension does not change `pi-subagent`.
Fork children keep their existing best-effort filtered parent context and rely on the Fork task for required context.

## User Stories

1. As a Codex user, I want Pi to use OpenAI remote compaction, so that long sessions preserve more usable context.

2. As a Codex user, I want remote compaction to avoid a parallel plaintext LLM summary, so that each compaction does not send the full context twice.

3. As a Pi user, I want fresh non-Codex sessions to remain unchanged, so that the extension does not affect unrelated models.

4. As a Codex user, I want remote compaction to follow Pi's existing compaction timing and retained-tail setting, so that I do not manage duplicate thresholds.

5. As a Codex user, I want compatible Codex models to reuse the active remote checkpoint, so that I can switch between compatible models without losing earlier context.

6. As a Pi user, I want a warning when I select an incompatible model, so that I know the model cannot read the remote checkpoint.

7. As a Pi user, I want temporary incompatible-model turns to preserve the remote checkpoint, so that switching back before another compaction restores the earlier Codex context.

8. As a Pi user, I want incompatible-model compaction to stop before it replaces a remote checkpoint, so that Pi does not silently discard opaque history.

9. As a Pi user, I want remote compaction failures to leave the session unchanged, so that transient OpenAI failures do not destroy continuity.

10. As a Pi user, I want `/compact-pi` to provide an explicit warned fallback, so that I can leave a remote checkpoint chain when necessary.

11. As a Pi user, I want remote compaction usage included in Pi statistics and `/cost`, so that compaction activity remains visible.

12. As a Fork user, I want Fork behavior to remain simple and provider-independent, so that Fork children can continue using their existing best-effort context.

## Implementation Decisions

### Scope

The extension must support only the `openai-codex` provider.
The extension must use Pi's existing Codex subscription authentication.
The extension must not support direct OpenAI API models, Azure, custom WebSocket transport, or `previous_response_id`.
The first version must not add extension configuration.

The implementation may use the behavior of the reference project and official Codex as technical guidance.
The implementation must be original and must not copy source from the reference project.

### Compaction triggers

The extension must handle Pi's existing automatic and manual compaction triggers.
The extension must not create another compaction threshold.
The extension must use Pi's `compaction.keepRecentTokens` setting for the visible tail.

The normal `/compact` command must request remote compaction for an active Codex model.
If `/compact` includes custom instructions, the extension must report that custom remote-compaction instructions are unsupported.
The extension must not silently ignore custom instructions.

### Request template

The extension must observe the latest completed Codex provider request.
The extension must retain the stable request settings needed for remote compaction.
The retained settings must include instructions, tools, reasoning settings, and text settings.

The extension must build a new remote-compaction request from the retained settings and the active session history.
The request must include the active remote checkpoint when one exists.
The request must include the visible tail and a trailing compaction trigger.
The request must set `store` to `false`.

The request must not reuse old input, response IDs, streaming settings, or storage settings.
If the extension has not observed a usable Codex request template, compaction must fail without changing the session.

### Remote checkpoint storage

The Pi compaction summary must contain this marker:

```text
Earlier context is stored in an OpenAI remote checkpoint and is unavailable to this model.
```

The Pi compaction entry must store extension state under `details.openaiRemoteCompaction`.
The stored value must be JSON-serializable and versioned.

The initial stored shape must provide these values:

```ts
interface OpenAIRemoteCompactionDetailsV1 {
  version: 1;
  replacementHistory: unknown[];
  creatingModelId: string;
  compactionCompatibilityHash?: string;
  continuationSettings: {
    instructions?: unknown;
    tools?: unknown;
    reasoning?: unknown;
    text?: unknown;
  };
}
```

This type shape is specification-derived.
The implementation may use stricter provider-specific types without changing the stored contract.

The extension must reconstruct the active remote checkpoint from the active Pi branch.
Reconstruction must work after resume, reload, tree navigation, and native Pi session forks.
Repeated remote compaction must include the previous remote checkpoint in the next request.

### Retry and failure behavior

Remote compaction must make at most three total attempts.
The extension must retry network failures, rate limits, and server errors.
The extension must respect `Retry-After` when OpenAI supplies it.
The extension must not retry authentication failures or invalid requests.
The extension must honor Pi's abort signal.

If all attempts fail, the extension must not save a new compaction entry.
The active remote checkpoint chain must remain unchanged.
The extension must report the failure to the user.

### Explicit Pi compaction

The extension must register `/compact-pi`.
The command must warn that Pi cannot include history stored only in remote checkpoints.
The command must require user confirmation.
Declining confirmation must leave the session unchanged.

After confirmation, `/compact-pi` must bypass remote compaction exactly once and invoke Pi's normal compaction.
A successful Pi compaction must end the active remote checkpoint chain.
The one-shot bypass must not affect later compactions.

### Model catalog and compatibility

The extension must resolve the current Codex OAuth token through Pi's model registry.
The extension must fetch and cache the official Codex model catalog.
The extension must read each model's `comp_hash` as its compaction compatibility hash.
The extension must store the creating model ID and known compatibility hash with each remote checkpoint.

A Codex model with a matching compatibility hash may reuse the remote checkpoint.
If the catalog is unavailable, the creating model may reuse its own checkpoint.
A different model with an unknown or different compatibility hash must not receive the checkpoint.

When the user selects an incompatible model, the extension must show a notification.
The extension must not cancel or revert the model selection.
The incompatible model must receive the plaintext marker and visible tail.

An incompatible-model turn must not remove the remote checkpoint.
If the user returns to a compatible Codex model before another compaction, the compatible model must receive the remote checkpoint and intervening plaintext messages.

If an incompatible model reaches a compaction trigger while a remote checkpoint remains active, the extension must cancel that compaction.
The extension must tell the user to select a compatible Codex model or run `/compact-pi`.

A session that begins with normal Pi compaction may later begin a remote checkpoint chain when Codex performs the next compaction.

### Non-Codex behavior

If the active branch has no remote checkpoint and the active model is not `openai-codex`, the extension must not alter compaction, model selection, requests, or session state.
Pi must retain its normal behavior.

### Fork behavior

The extension must not modify or depend on `pi-subagent`.
Fork children must keep the existing filtered-context behavior.
The extension must not add remote checkpoints to Fork snapshots.
The caller must place essential delegated context in the Fork task.

### Usage accounting

The extension must map remote response usage into `CompactionEntry.usage` when OpenAI provides usage.
After Pi saves the compaction, the extension must append a `pi.usage.recorded` custom entry.
The custom entry must use schema version 1.
The entry must identify `openai-remote-compaction` as the extension and `remote-compaction` as the operation.
The entry must identify the `openai-codex` model.
The entry must normalize input, output, cache-read, cache-write, total-token, and numeric cost values.

The extension must not import or call the `pi-cost` extension.
The shared contract is the persisted `pi.usage.recorded` entry format.

## Testing Decisions

### Required external behavior

Tests must prove that a Codex session can compact remotely, persist a remote checkpoint, reload, and continue with the saved checkpoint.
Tests must prove that remote compaction always uses `store: false`.
Tests must prove that failed compaction leaves the session unchanged.
Tests must prove that non-Codex sessions retain normal Pi behavior.
Tests must prove the settled compatible and incompatible model behavior.
Tests must prove that `/compact-pi` performs one explicit normal Pi compaction after confirmation.
Tests must prove that remote usage appears in the standard compaction entry and the shared usage record.

### Primary acceptance seam

The primary acceptance seam is a real in-process Pi `AgentSession` loaded through Pi's public extension resource loader.
The test session must use a deterministic fake `openai-codex` model, a temporary persisted `SessionManager`, and mocked remote HTTP responses.

The primary acceptance test must perform this flow:

1. Start a Pi session with the extension loaded.
2. Establish a Codex provider request template.
3. Trigger compaction through Pi's public session interface.
4. Return a known remote checkpoint from mocked OpenAI HTTP.
5. Verify the saved marker, extension details, and standard usage.
6. Verify the appended `pi.usage.recorded` entry.
7. Reload the persisted session through a new Pi session.
8. Send another prompt.
9. Verify that the next Codex request contains the remote checkpoint and visible tail.
10. Verify that remote compaction used `store: false`.

### Supporting seams

Pure request-construction tests must verify included and excluded provider fields.
Session-state tests must verify branch reconstruction and repeated remote checkpoints.
Catalog-adapter tests must verify parsing, caching, missing hashes, malformed responses, and fetch failures.
Compatibility tests must verify matching, mismatched, and unavailable catalog states.
Retry tests must verify retryable responses, non-retryable responses, `Retry-After`, aborts, and the three-attempt limit.
Command tests must exercise `/compact` and `/compact-pi` through registered command behavior.
Notification tests must observe `ctx.ui.notify` through a public extension lifecycle fake.
Usage tests must inspect the saved branch after `session_compact`.

### Testing precedent

Offline tests should use Vitest, consistent with nearby local Pi extensions.
Lifecycle tests should load real extension handlers or use lightweight public `ExtensionAPI` fakes.
Tests must not inspect private implementation state when the public Pi lifecycle exposes the behavior.

### Live validation

Live Codex tests must remain opt-in and must not run in normal validation.
Live validation must cover initial compaction, repeated compaction, resume, tree navigation, compatible model switching, temporary incompatible turns, and failure behavior.
Live validation must verify `store: false` on remote compaction requests.

Run live validation during initial implementation.
Run live validation again after material protocol changes or major Pi upgrades.

## Out of Scope

- Direct OpenAI API models
- Azure OpenAI
- Custom WebSocket transport
- `previous_response_id`
- Continuous plaintext summaries
- Portable cross-provider handoff
- Remote checkpoint inheritance by `pi-subagent`
- Changes to Fork snapshot behavior
- Cross-hash checkpoint migration
- Automatic fallback to Pi compaction
- Custom remote-compaction instructions
- Extension configuration
- Publication as a separate package or repository

## Further Notes

The official Codex implementation is behavioral guidance for remote compaction and model compatibility.
The opaque OpenAI response does not contain `comp_hash`.
The extension must obtain `comp_hash` from the official Codex model catalog and store it beside the remote checkpoint.

The first version deliberately favors low recurring cost and Codex continuity over automatic provider portability.
A future portable-handoff feature can ask a compatible Codex model to create a plaintext summary before leaving the remote checkpoint chain.
That future feature is not required by this specification.

Fork parent context remains best effort.
The project has no evidence that passing older compacted history improves Fork results enough to justify coupling Fork behavior to provider-native checkpoints.
