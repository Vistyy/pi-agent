# Implementation plan: lifecycle redesign

## Goals

Make OM less noisy, cheaper, more continuous, and safer around compaction.

Current direction:

1. Keep observer work closed for this pass unless real-session regressions reappear.
2. Rework curator evals with the same hard-check + partial-score approach used for observer.
3. Then address reflector lifecycle/evals, memory-budget semantics, recall, and end-to-end evals in that order.
4. Prefer low reasoning for observer/curator/reflector unless evals prove otherwise.

## Completed this redesign pass

- Additive mode removed; default strategy is `replacement`.
- Compaction uses an observer-only safety flush and does not block on full OM catchup.
- Context taxonomy exists: `contextProjection`, `nextContextProjection`, reviewed/unreviewed, pinned reviewed visibility.
- Reviewed observations are hidden from next context by default; unreviewed and pinned reviewed observations remain visible.
- Follow-up flags use bounded free-text reasons and are implicitly resolved by later reflector review coverage.
- Pin/unpin state exists; dropped tombstones remain hard suppression.
- Curator replaced dropper and can pin, unpin, flag, and drop reviewed observations.
- Curator runs after reflector or under visible-observation emergency pressure.
- Dropper code and eval routing were removed.
- Observer input is sanitized and primary-source filtered.
- Observer tool rendering is policy-based:
  - unknown/generic successful tools are metadata-only by default
  - mutation tools inherit metadata-only unless configured otherwise
  - bash and errors use bounded excerpts
  - configured delegation tools such as `fork` can use `full-excerpt`
  - long lines are capped by `observerToolResultLineMaxChars`
- Observer hard evals are done for this pass:
  - 7-case scored hard suite exists
  - hard checks distinguish unsafe failures from score/completeness misses
  - current mini-low baseline passes hard checks
  - future observer eval hardening is deferred unless real sessions show regressions

## Current lifecycle

```text
source entries
  ↓
observer
  records raw observations from sanitized primary source input
  ↓
unreviewed observations
  visible in next context by default
  ↓
reflector
  synthesizes meaning and advances review coverage
  ↓
reviewed observations
  hidden by default unless pinned
  ↓
curator
  pins, unpins, flags follow-up, or drops reviewed observations
```

`Next context` is:

```text
current reflections
+ unreviewed observations
+ pinned reviewed observations
- dropped observations
```

## Observer source input: current contract

Observer coverage advances over source ledger entries, but observer model input now renders only primary `message` entries.

Rendered message roles:

| Source | Behavior |
|---|---|
| user message | included, capped per entry |
| assistant message | included, thinking redacted, capped per entry |
| tool result | included as sanitized tool evidence |
| bash execution | included as sanitized command/output evidence |
| unsupported/derived roles | skipped |

Skipped as observer model input:

```text
compaction
branch_summary
custom_message
custom/branch/compaction message roles
```

If a chunk has only skipped entries, observer coverage advances with zero observations so the cursor does not stall.
Observations may cite only rendered source ids.

Current defaults:

```text
observerToolResultSummaryMaxLines = 4
observerToolResultErrorMaxLines = 20
observerToolResultLineMaxChars = 300
observerToolOutputPolicies = { fork: "full-excerpt" }
```

## Next planned work

### Stage 1: Curator eval second pass

Goal: make curator evals as legible and useful as observer evals.

Tasks:

- Convert curator evals to hard-check + partial-score style.
- Keep hard failures for unsafe actions:
  - dropping protected/current evidence
  - failing required unpin safety
  - acting on non-candidate ids
  - exceeding action/drop caps
- Use score dimensions for retained detail, provenance, follow-up quality, and completeness.
- Revisit hard cases for realism:
  - historical/session-derived reviewed pools
  - stale/current traps
  - contradictory reflections
  - pinned stale failures with newer passing evidence
  - noisy reviewed pools with buried exact atoms
- Keep synthetic smoke cases minimal.
- Rerun low-thinking curator baseline after score semantics are clear.

### Stage 2: Reflector lifecycle redesign + evals

Goal: reduce reflection volume and improve meaning repair before changing broader memory pressure.

Tasks:

- Add/refresh reflector hard evals with hard-check + score semantics.
- Test dense synthesis, stale/current preservation, exact detail retention, and corrective follow-up handling.
- Decide whether reflector synthesis should move observations out of active/visible context more aggressively.
- Revisit reflection lifecycle only as needed:
  - deprecate/supersede reflections
  - merge duplicates
  - retain exact stale/current relationships

### Stage 3: Memory budget / full-fold / emergency pressure redesign

Goal: replace misleading size/full-fold thresholds with a real, understandable pressure model.

Current problems:

- `observationsPoolMaxTokens` sounds like a memory cap but only controls compaction projection shape.
- Status compares observations + reflections against an observation-only threshold.
- Crossing the threshold does not curate, drop, cap, or retire memory.
- Emergency curator pressure is count-based, not token-based.
- Reflections can grow large independently of observation pressure.
- Cursor-filtered curator candidates can make emergency pressure fire without enough actionable material.

Design questions:

1. What is the real bounded resource: next-context tokens, observation tokens, reflection tokens, source-entry lag, or a combination?
2. Should token pressure force reflector first, curator first, both, or a separate lifecycle pass?
3. Should emergency curator see all reviewed visible/pinned candidates, not just since-cursor candidates?
4. Should reflection pressure trigger reflection deprecation/supersede earlier than planned?
5. What status lines explain lifecycle pressure without implying a fake cap?

### Stage 4: Recall lookup + evals

Goal: make exact evidence recovery reliable after compaction.

Tasks:

- Unit-test recall lookup mechanics separately from model behavior.
- Add model evals for deciding when exact source evidence is required.
- Cover stale/current traps, exact path/error/API questions, and provenance-sensitive answers.
- Improve UX/status around recalled evidence and source provenance.

### Stage 5: End-to-end evals

Goal: test the whole OM lifecycle under realistic long-session pressure.

Tasks:

- Build observer → reflector → curator → compaction → recall replay cases.
- Use historical/session-derived slices first.
- Include multi-compact sessions and giga-session pressure.
- Track hard failures, partial scores, token cost, latency, and retained exact evidence.

## Deferred / conditional

- More observer eval hardening only if real sessions show observer regressions.
- Reflection deprecation/supersession only if reflection volume becomes a dominant context/cost risk before Stage 2.
- More config knobs only after evals prove a single policy is insufficient.
