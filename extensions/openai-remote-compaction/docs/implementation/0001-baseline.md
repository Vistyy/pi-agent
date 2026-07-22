# Task 0001 implementation baseline

## Baseline

Full repository `HEAD`: `87d8560045b2925af0581efbca82b0edb3fdde50`

Task source: [`tasks/0001-preserve-remote-checkpoint.md`](../../tasks/0001-preserve-remote-checkpoint.md)

Normative specification: [`SPEC.md`](../../SPEC.md)

The extension documentation is untracked at baseline.
The modified repository `settings.json` is unrelated and must remain unchanged.

## Acceptance mapping

| Acceptance criterion | Implementation target | Public test seam | Verification target |
| --- | --- | --- | --- |
| Codex remote request | Extension compaction lifecycle | Provider-shaped payload plus mocked OpenAI HTTP | Request contains active history, trailing trigger, and `store: false` |
| Saved checkpoint | Pi compaction result | Saved session branch | Marker, retained-tail ID, versioned details, and usage are present |
| Continuation and repetition | Provider request lifecycle | `before_provider_request` and second compaction | Marker is replaced by the remote checkpoint |
| Reload and branch reconstruction | Active branch parser | Persisted `SessionManager` branch | Active branch selects its own latest checkpoint |
| Non-Codex behavior | Extension lifecycle | Non-Codex event context | Handler does not replace Pi behavior |

## Validation

Run `pnpm test` in the extension directory.
Run `pnpm typecheck` in the extension directory.
Run the opt-in live test only when offline validation passes and Codex authentication is available.

## Decision ledger

- `user-approved`: Implement current Codex remote compaction v2 with a trailing `compaction_trigger`, SSE, and `store: false`.
- `local`: Use Pi's exported Responses message converter to keep provider serialization knowledge in Pi.
- `local`: Reconstruct remote state from the active branch for every lifecycle decision instead of keeping remote state only in memory.
- `local`: Replace the exact Pi marker input item with the opaque remote checkpoint before compatible provider requests.
- `deferred to task 0002`: Multi-attempt retry policy and final-failure behavior.
- `deferred to task 0003`: Catalog caching and cross-model compatibility decisions.
- `deferred to task 0004`: `/compact-pi` and custom-instruction behavior.
- `deferred to task 0005`: `pi.usage.recorded` integration.
