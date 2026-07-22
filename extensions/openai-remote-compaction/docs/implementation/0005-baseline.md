# Task 0005 implementation baseline

## Baseline

Full repository `HEAD`: `90fbee7ad1c336c998f7217c49674ecf0ac20614`

Task source: [`tasks/0005-record-remote-compaction-usage.md`](../../tasks/0005-record-remote-compaction-usage.md)

Normative specification: [`SPEC.md`](../../SPEC.md)

## Acceptance mapping

| Acceptance criterion | Implementation target | Public test seam | Verification target |
| --- | --- | --- | --- |
| Standard Pi usage | Remote compaction result | Saved compaction entry | `CompactionEntry.usage` contains normalized OpenAI usage |
| Shared usage entry | `session_compact` lifecycle | Persisted branch after compaction | One `pi.usage.recorded` entry follows successful remote compaction |
| Required identity | Shared usage schema | Custom entry data | Extension, operation, provider, and model are present |
| No false records | `session_compact` lifecycle | Failed and ordinary compactions | No remote usage entry is appended |

## Validation

Run `pnpm test` in the extension directory.
Run `pnpm typecheck` in the extension directory.

## Decision ledger

- `user-approved`: Record usage in both Pi's standard compaction field and the shared `/cost` record.
- `user-approved`: Follow the `pi-subagent` convention without importing `pi-cost`.
- `local`: Append the custom usage record only after Pi emits `session_compact` for a saved remote compaction.
- `local`: Use numeric zero cost for Codex subscription usage when OpenAI provides no monetary cost.
