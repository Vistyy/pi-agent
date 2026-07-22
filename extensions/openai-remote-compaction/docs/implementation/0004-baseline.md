# Task 0004 implementation baseline

## Baseline

Full repository `HEAD`: `a95dc20f718163890c363379a97eb1e23ca17d54`

Task source: [`tasks/0004-choose-compaction-behavior-explicitly.md`](../../tasks/0004-choose-compaction-behavior-explicitly.md)

Normative specification: [`SPEC.md`](../../SPEC.md)

Task 0003's Standards review requires this task before the incompatible-model guard can be considered independently usable.

## Acceptance mapping

| Acceptance criterion | Implementation target | Public test seam | Verification target |
| --- | --- | --- | --- |
| Custom instructions | Compaction lifecycle | `session_before_compact` | Compaction cancels with an unsupported message |
| Declined fallback | `/compact-pi` command | Registered command handler and confirmation UI | No compaction starts |
| Confirmed fallback | Command plus compaction lifecycle | Registered command and next compaction event | Exactly one event bypasses remote handling |
| Ended chain | Pi ordinary compaction result | Active branch parser | Latest ordinary compaction has no active remote checkpoint |

## Validation

Run `pnpm test` in the extension directory.
Run `pnpm typecheck` in the extension directory.

## Decision ledger

- `user-approved`: `/compact-pi` is the explicit destructive escape hatch.
- `user-approved`: Custom remote-compaction instructions are unsupported and must fail clearly.
- `local`: Scope the one-shot bypass by Pi session ID and consume it at the next compaction event.
- `local`: Clear an unused bypass through the command's error callback.
