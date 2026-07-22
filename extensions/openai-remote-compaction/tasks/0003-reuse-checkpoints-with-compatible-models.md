# Compatible models reuse remote checkpoints safely

## Specification

[OpenAI Remote Compaction Specification](../SPEC.md)

## Behaviors owned

- Fetch and cache the official model catalog through `Model catalog and compatibility`.
- Persist `comp_hash` and allow matching models to reuse a remote checkpoint.
- Warn for incompatible selection, preserve temporary incompatible turns, restore compatible continuation, and block incompatible compaction.

## What to build

Deliver model compatibility decisions around the active remote checkpoint without blocking model selection.

## Primary verification seam

Pi model-selection, provider-request, and compaction lifecycle handlers with mocked catalog HTTP.

## Acceptance criteria

- [ ] Matching hashes reuse the checkpoint and mismatched or unknown different models do not receive it.
- [ ] Catalog failure permits only the creating model to continue.
- [ ] Incompatible selection warns without reverting, and incompatible compaction is cancelled.
- [ ] Switching back before compaction restores the checkpoint with intervening plaintext messages.

## Blocked by

- [Task 0001](./0001-preserve-remote-checkpoint.md)
