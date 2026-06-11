# Observational memory lifecycle redesign

## Problem summary

Current OM behavior is too close to a rolling FIFO window.

Observed in real sessions:

- Dropper runs mostly under pool pressure.
- It drops near its max cap when it runs.
- Older unprotected observations are more likely to disappear than lower-value observations.
- Recall has not been used in audited sessions.
- Reflections are useful, but unbounded and not deprecated.

The core issue is that the system lacks a clean lifecycle between raw observation, semantic review, context inclusion, compaction, and recall.

## Desired model

Separate three responsibilities:

```text
observer  = extract raw observations
reflector = synthesize meaning and advance semantic review
curator   = manage context inclusion, safety, and follow-up requests
recall    = recover source evidence when exact context matters
```

The current "dropper" should evolve into a curator. It should not simply drop old observations under pool pressure.

## Minimal state model

Avoid many item states. Use two axes:

```text
1. Has the observation been semantically reviewed?
2. Is the observation shown in active prompt context?
```

Resulting mental states:

| State | Reviewed? | In context? | Meaning |
|---|---:|---:|---|
| active | no | yes | raw recent observation, not yet semantically reviewed |
| pinned | yes | yes | reviewed but still useful/important to show exactly |
| covered | yes | no | represented by reflections, hidden by default |
| suppressed | no/yes | no | hidden as low-value/noisy |

`dropped` should be treated as an action/tombstone, not the primary mental model.

## Pinned vs active

```text
active = included in context because not reviewed yet
pinned = included in context despite being reviewed
```

Examples:

```text
active:
  "User just said they want to remove additive mode."
  Not yet reflected.

pinned:
  "User wants pnpm, not npm."
  Already reflected, but exact preference should stay in context.
```

## Covered vs suppressed

```text
covered = hidden because reflection represents it
suppressed = hidden because low-value/noisy
```

Examples:

```text
covered:
  "Changed reflectorThinking from xhigh to high."
  Reflected in summary.

suppressed:
  "Ran test, failed due to transient syntax error."
  Not worth reflecting or showing.
```

## Proposed lifecycle

```text
source entries
  ↓
observer
  records raw observations
  ↓
active observations
  included in next context by default
  ↓
reflector
  reviews active observations
  emits/refines reflections
  advances semantic review cursor
  ↓
reviewed observations
  hidden by default as covered
  ↓
curator/dropper
  audits reviewed observations
  emits context/safety actions
```

Curator actions:

```text
pin reviewed observation
  keep exact reviewed observation in context

cover reviewed observation
  keep hidden because reflection represents it

suppress observation
  hide low-value/noisy observation

flag for re-review
  request reflector follow-up because compression looks unsafe
```

## No cursor rewinds

Do not move observations back in front of the review cursor.

Cursors should stay append-only and monotonic. If the curator finds a reviewed observation that needs follow-up, append a separate flag event.

Example:

```text
om.observations.flagged
{
  observationIds: [...],
  reason: string // short one-line explanation for reflector follow-up, normalized/truncated, not deterministic routing
}
```

Reflector then has two inputs:

```text
normal input:
  observations after review cursor

follow-up input:
  flagged reviewed observations
```

Flow:

```text
curator finds problem
  ↓
append om.observations.flagged
  ↓
reflector next run sees flagged observations
  ↓
reflector updates/refines reflections
  ↓
flag is resolved by later review/coverage
```

## Prompt assembly goal

Next context should be:

```text
current reflections
+ unreviewed active observations
+ pinned reviewed observations
```

Reviewed non-pinned observations should be hidden by default but recoverable through recall/provenance.

This should reduce prompt noise more cleanly than pool-size dropping.

## Compaction and fork readiness

This model meshes with always-ready compaction.

The compacted context should be maintained from:

```text
reflections
+ pinned reviewed observations
+ active unreviewed observations
+ compact context metadata
```

Compaction should become a checkpoint, not a large maintenance event.

Desired flow:

```text
normal lifecycle:
  observer captures recent source entries
  reflector reviews in small batches
  curator updates context decisions
  projection stays warm

before compaction:
  flush only tiny unobserved tail if needed
  use already-warm projection
  do not run expensive reflector/curator synchronously unless emergency

after compaction:
  background maintenance continues
```

Fork agents should receive the same warm projection without waiting for a last-second full memory update.

## Reflection lifecycle problem

Reflections are currently append-only. That creates unbounded growth and stale/superseded guidance.

Needed additions:

```text
reflection supersedes/deprecates metadata
reflection review/curation pass
possibly reflection compaction/merge events
```

Possible event:

```text
om.reflections.reviewed
{
  deprecatedReflectionIds: [...],
  supersededBy: [{ oldId, newId }],
  coversUpToId: "..."
}
```

Goal:

```text
current reflections = non-deprecated reflections + latest merged/superseding reflections
```

This is separate from observation context inclusion, but related because covered observations depend on reflection quality.

## Staged implementation plan

### Stage 1: Rename/reframe dropper as curator internally

No behavior change required at first.

- Keep current tombstone compatibility.
- Introduce docs/types around context decisions.
- Preserve old `om.observations.dropped` until migration is clear.

### Stage 2: Add reviewed/covered-by-default projection

- Reflected/reviewed observations stop appearing in active prompt by default.
- Context observations become unreviewed + pinned.
- This is the biggest noise reduction.

### Stage 3: Add pin and flag events

- Curator can pin exact reviewed observations.
- Curator can flag reviewed observations for reflector follow-up.
- No cursor rewind.

### Stage 4: Add suppression

- Curator can suppress low-value observations.
- Suppression hides noise without relying on reflection correctness.

### Stage 5: Rework triggers

Replace pool-size-first behavior with cursor/review driven behavior:

```text
reflector due when enough unreviewed observations or flagged follow-ups exist
curator due when enough newly reviewed observations or context pressure exists
hard pool cap remains emergency only
```

### Stage 6: Reflection lifecycle

- Add reflection deprecation/supersede events.
- Add reflection curation/merge pass.
- Keep reflection pool bounded and current.

### Stage 7: Always-ready projection for compaction/fork

- Maintain warm projection during normal lifecycle.
- Compaction hook only flushes minimal tail.
- Fork agents consume warm projection directly.

## Open questions

1. Should curator be a renamed dropper or a new agent wrapper around the same model prompt?
2. Should covered observations remain recallable after source entries are compacted?
3. What exact prompt/context should reflector receive for flagged follow-up observations?
4. Should pinned observations have TTL/expiry or only explicit unpin?
5. How much reflection deprecation should happen in reflector vs curator?
6. How should current `om.observations.dropped` tombstones migrate into the new context model?
