# Future work notes

## Observational memory reflection-pool cap

Add a separate reflection-pool cap and consolidation behavior if visible reflections become too large in long sessions.

Current state: reflection visibility is decoupled from the observation token pool. Incremental compaction materializes recorded reflections, while full-fold compaction is reserved for deeper replay/drop reconciliation.

Why later: reflection growth may not be a real problem yet. Keep the current behavior simple until long-session usage shows pressure.

## Memory-backed pi-fork context mode

Explore an optional `pi-fork` context mode that sends a compact memory-backed context to the child instead of the full session branch.

Possible shape:

- trigger or wait for `pi-observational-memory` / compaction
- build child context from active observations, reflections, and maybe recent turns
- compare against the current full-snapshot behavior for answer quality, cost, latency, and missing-context failures

Why later: this couples `pi-fork` to memory/compaction semantics and can silently lose nuance if memory is incomplete. The current full-session snapshot should stay the default until this is evaluated carefully.
