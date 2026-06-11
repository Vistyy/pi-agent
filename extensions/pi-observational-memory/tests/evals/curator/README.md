# Curator model evals

These evals cover curator judgment. They are not deterministic unit tests and should not run as part of `pnpm test`.

## Purpose

Unit tests should verify ledger/projection mechanics:

```text
fold pin/unpin/drop/flag events
projection includes unreviewed + pinned reviewed
drop wins over pin/flag
pending flags resolve after reflector review
```

Model evals should verify curator choices:

```text
exact path/error missing from reflection      → flag + maybe pin
exact detail already captured in reflection   → no pin
old pinned failure superseded by passing run   → unpin old
user preference/current constraint            → do not drop
noisy transient logs                          → drop
reflection contradicts observation            → flag and keep visible
important only for recall                     → neither pin nor drop
many candidate pins                           → choose minimal pins
flagged then dropped                          → do not keep spending reflector budget
fork/compaction projection                    → no unsafe loss of context
```

## Runner status

No eval runner exists yet. Add one before implementing or trusting curator pin/unpin behavior.

Requirements:

- uses live model calls
- runs separately from `pnpm test`
- records prompt, model output, parsed actions, and pass/fail rationale
- reusable for later recall evals
