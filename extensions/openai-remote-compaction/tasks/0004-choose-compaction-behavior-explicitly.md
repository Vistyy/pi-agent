# Users can explicitly choose compaction behavior

## Specification

[OpenAI Remote Compaction Specification](../SPEC.md)

## Behaviors owned

- Reject custom remote-compaction instructions through `Compaction triggers`.
- Register `/compact-pi` through `Explicit Pi compaction`.
- Confirm the destructive fallback, bypass remote compaction once, and end the remote checkpoint chain.

## What to build

Deliver explicit command behavior for remote compaction and ordinary Pi compaction.

## Primary verification seam

Registered Pi command handlers and the compaction lifecycle.

## Acceptance criteria

- [ ] Custom `/compact` instructions cancel with a clear unsupported message.
- [ ] Declining `/compact-pi` leaves the session unchanged.
- [ ] Confirming `/compact-pi` invokes exactly one normal Pi compaction and consumes the bypass.
- [ ] The resulting normal compaction ends the remote checkpoint chain.

## Blocked by

- [Task 0001](./0001-preserve-remote-checkpoint.md)
