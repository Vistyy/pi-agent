# One-shot OM worker plan

## Goal
Reduce synchronous compaction latency and hidden OM worker token cost while preserving source-backed lifecycle safety.

## Changes

### Observer
- Keep `record_observations({ observations: [...] })` as one-shot.
- Add `mark_observed_no_observations()` for chunks with no durable observations.
- Both tools terminate the worker run.
- `mark_observed_no_observations()` advances observation coverage by appending `OM_OBSERVATIONS_RECORDED` with `observations: []`.
- No-tool observer response should not be treated as reviewed/covered; log/debug as discipline failure.

### Reflector
- Make `record_reflections({ reflections: [...] })` terminate the worker run.
- Make `mark_reviewed_no_reflections()` terminate the worker run.
- Keep separate no-reflections tool rather than empty `record_reflections([])` because it explicitly advances review lifecycle.
- No-tool reflector response should not silently mean reviewed; keep/debug as discipline failure.

### Dropper
- Make `drop_observations({ ids: [...] })` terminate the worker run.
- Add explicit `mark_no_drops()` if no observations are safe to drop.
- `mark_no_drops()` terminates but does not append lifecycle state.

### Compaction policy
- Keep safe mode: force observer only when compaction would discard unobserved source entries before `firstKeptEntryId`.
- After one-shot/no-op tools, measure before changing compaction policy.
- Possible later refinement: avoid non-essential synchronous reflector/dropper work at compaction boundary.

## Validation
- Extension typecheck and tests.
- Eval typecheck.
- `om-agent-evals`.
- 3-case low comparison:
  - `multi-hop-artifact-path`
  - `long-noisy-current-path`
  - `unresolved-conflict-with-prior-final`
- Compare pass/fail, wall time, OM provider tokens, worker request counts, observations/reflections/drops.
