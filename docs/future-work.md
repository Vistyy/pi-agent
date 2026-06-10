# Future work notes

## Observational memory reflection-pool cap

Add a separate reflection-pool cap and consolidation behavior if visible reflections become too large in long sessions.

Current state: reflection visibility is decoupled from the observation token pool. Incremental compaction materializes recorded reflections, while full-fold compaction is reserved for deeper replay/drop reconciliation.

Why later: reflection growth may not be a real problem yet. Keep the current behavior simple until long-session usage shows pressure.

## Compact pi-fork context, OM, and recall

Explore an optional `pi-fork` context mode that sends a compacted context to the child instead of the full session branch.

Working direction:

- keep full-session snapshot as the safe default until evals justify changing it
- add a `compact` fork context setting independent of `pi-observational-memory`
- prefer doing compaction before the child starts, so the child can still run with `--no-extensions`
- let normal Pi compaction hooks participate when appropriate, so OM can enrich the compacted context
- avoid running normal OM observer/reflector/dropper agents inside every fork child by default

Open design questions:

- Should compact fork context use normal session compaction, even if it mutates the parent session?
- Do we need a temporary/side-effect-free compaction path for fork snapshots?
- How can fork use OM-enhanced compaction without requiring OM to be enabled inside the child agent?
- Should fork children get a recall-only OM mode, or should relevant memory be injected before launch?
- If recall is unavailable in fork children, what evals prove compacted context still preserves enough information?
- If recall is available, how do we disable redundant OM internal agents and control cost?

Needed evals:

- full snapshot vs compacted context on long/noisy sessions where key facts are only in prior context
- compacted context with and without OM-enriched compaction
- cases where recall would matter: exact prior wording, stale/current relationships, provenance, and buried constraints
- cost/latency comparison for fast, balanced, and deep forks
- failure cases where compacted context loses nuance that full snapshot preserved

Why later: this couples `pi-fork`, compaction semantics, and possibly `pi-observational-memory`. The right approach needs eval evidence and a more final decision on parent-session side effects, child extension policy, and recall availability.
