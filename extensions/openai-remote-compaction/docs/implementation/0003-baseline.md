# Task 0003 implementation baseline

## Baseline

Full repository `HEAD`: `81a379d43b2cdc294bbd67289014cc55393d76cd`

Task source: [`tasks/0003-reuse-checkpoints-with-compatible-models.md`](../../tasks/0003-reuse-checkpoints-with-compatible-models.md)

Normative specification: [`SPEC.md`](../../SPEC.md)

## Acceptance mapping

| Acceptance criterion | Implementation target | Public test seam | Verification target |
| --- | --- | --- | --- |
| Catalog and matching hashes | Codex model catalog adapter and compatibility rule | Mocked catalog HTTP plus provider request lifecycle | Matching hashes inject the remote checkpoint |
| Catalog unavailable | Compatibility rule | Failed catalog fetch | Only the creating model continues |
| Selection warning and compaction guard | Model selection and compaction lifecycle | Captured notifications and compaction result | Selection remains allowed and incompatible compaction is cancelled |
| Temporary incompatible turn | Provider request lifecycle and active branch parser | Switch away and back on one branch | Checkpoint returns with intervening plaintext input |

## Validation

Run `pnpm test` in the extension directory.
Run `pnpm typecheck` in the extension directory.

## Decision ledger

- `user-approved`: Use the official model catalog's `comp_hash` as the compatibility identity.
- `user-approved`: Catalog failure permits only the creating model to continue.
- `local`: Cache catalog responses for five minutes and use `ETag` revalidation.
- `local`: Keep the last valid catalog as stale evidence when refresh fails.
- `local`: Centralize Codex OAuth header construction for catalog and compaction requests.
