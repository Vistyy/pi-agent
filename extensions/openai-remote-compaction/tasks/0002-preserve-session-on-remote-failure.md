# Remote failures preserve the session

Status: Complete

Completion evidence:

- Implementation commits: `a95cb75` through `c15d52f`
- Verification: `pnpm test` and `pnpm typecheck`
- Review: Spec approved and Standards approved with required comments resolved

## Specification

[OpenAI Remote Compaction Specification](../SPEC.md)

## Behaviors owned

- Retry network failures, rate limits, and server failures through `Retry and failure behavior`.
- Respect `Retry-After`, use at most three attempts, and stop immediately for authentication, invalid requests, and aborts.
- Leave the active remote checkpoint chain unchanged after final failure.

## What to build

Deliver classified, abort-aware retries around remote compaction without saving a compaction result after final failure.

## Primary verification seam

The Pi compaction lifecycle with sequenced mocked HTTP responses.

## Acceptance criteria

- [ ] Retryable failures make no more than three total attempts and respect server delay instructions.
- [ ] Authentication, invalid-request, terminal usage-limit, and abort failures do not retry.
- [ ] Final failure cancels compaction, reports the error, and preserves the branch.

## Blocked by

- [Task 0001](./0001-preserve-remote-checkpoint.md)
