# Task 0002 implementation baseline

## Baseline

Full repository `HEAD`: `75533accc095f14cb87d4243ef269d8707c3d46f`

Task source: [`tasks/0002-preserve-session-on-remote-failure.md`](../../tasks/0002-preserve-session-on-remote-failure.md)

Normative specification: [`SPEC.md`](../../SPEC.md)

## Acceptance mapping

| Acceptance criterion | Implementation target | Public test seam | Verification target |
| --- | --- | --- | --- |
| Retryable failures | Remote compaction transport | Sequenced mocked HTTP and sleep adapter | At most three attempts with specified delay |
| Terminal failures | Remote compaction transport | Mocked authentication, invalid-request, usage-limit, and abort responses | One attempt and immediate error |
| Preserved session | Pi compaction lifecycle | Saved branch before and after final failure | No compaction entry is added and an error notification appears |

## Validation

Run `pnpm test` in the extension directory.
Run `pnpm typecheck` in the extension directory.

## Decision ledger

- `user-approved`: Retry network, rate-limit, and server failures with three total attempts.
- `user-approved`: Respect `Retry-After` and do not retry authentication or invalid requests.
- `local`: Match Pi's retryable HTTP statuses and terminal subscription-limit detection.
- `local`: Inject sleep only at the remote transport seam so tests remain deterministic.
