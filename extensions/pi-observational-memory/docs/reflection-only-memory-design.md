# Reflection-only active memory design

## Goal

Make OM bounded, cheap, and safe around compaction by separating durable evidence from active memory.

Core idea:

```text
ledger = durable truth
active memory = current reflections only
recall = exact evidence recovery
```

Observations are not prompt memory. They are background evidence used by reflector and recall. The normal compression path is small-cluster maintenance over active reflections. Global rewrite, if retained, is an emergency background fallback only.

## Non-goals

- No semantic/search recall.
- No pinned observation pool.
- No curator lifecycle.
- No synchronous rewrite, reflector, curator, or maintainer work during compaction.
- No backcompat requirement for pin/unpin behavior in active state.
  Readers should still tolerate old ledger events without crashing.
  Old pin/unpin events are ignored rather than interpreted as active state.

## Ledger vs projection

The ledger is the append-only session/event record:

```text
source entries
om.observations.recorded
om.reflections.recorded
om.reflections.rewritten
other OM maintenance events
```

The projection is derived from the ledger.

Target active projection:

```text
current active reflections
```

Hidden but recallable:

```text
source entries
observations
retired reflections
rewrite audit manifests
```

## Implementation principle

Avoid long-lived dual paths.

Compatibility is only at read boundaries:

```text
old ledger record -> normalize or ignore -> new internal model
```

Core fold/projection/recall code should use one shape. Do not keep parallel legacy projection, legacy pinning behavior, or feature-flagged old lifecycle paths.

## Typed ids

Use self-typed ids so a single source array can safely reference different record kinds.

Preferred forms:

```text
obs_<id>
ref_<id>
src_<id>   // optional later, if direct source-entry refs become useful
rw_<id>    // rewrite event id, for audit/status/recall if needed
```

Validation routes ids by prefix. Untyped 12-character ids should be phased out in model-facing schemas.

## Reflection record

Use one reflection shape regardless of whether the reflection came from normal reflection or rewrite.

```ts
interface Reflection {
  id: string;        // ref_*
  content: string;   // single-line current memory statement
  sources: string[]; // typed ids
  createdAt: string; // synthesis time
}
```

Normal reflector sources:

```text
obs_*
```

Maintainer/rewrite replacement sources:

```text
ref_* direct parents
```

Replacement agents should not flatten transitive `obs_*` ancestry from parent refs. Reflector-created new facts may still cite direct `obs_*` evidence.

`createdAt` is when the reflection record was produced. Stale/current reasoning should use source timestamps/order, not only rewritten reflection timestamps. A rewrite batch may create many reflections with the same `createdAt`; that is expected.

## Observer contract

Observer extracts source-backed evidence atoms. It should stay close to visible source payload and should not decide final active-memory worth.

A concrete command or test result can be a valid observation when the source shows it. Durability filtering belongs to the reflector: routine validation output should become active memory only when it names a substantive validated behavior, blocker resolution, current state, or user/project decision.

## Normal reflector contract

Normal reflector may read current reflections for context, but cites observations only.

Responsibilities:

- consume observations not yet covered by reflection coverage and current reflections
- emit current active reflections sourced to `obs_*`
- preserve exact paths, commands, errors, ids, config names, and user constraints when they are durable anchors
- preserve stale/current relationships when relevant
- avoid meta/eval chatter unless it is a durable project decision
- advance reflection coverage with `om.reflections.recorded`, including empty reflection batches when no durable memory should be added

Normal reflector does not:

- cite old reflections
- retire old reflections
- pin observations
- unpin observations
- drop observations

## Observation visibility

Observations are durable evidence, not active memory.

Default projection includes no observations:

```text
active memory = current active reflections
```

No raw-observation fallback by default. If reflector lag or failures prove unsafe in evals or real sessions, add an explicit emergency fallback later. Do not silently reintroduce observation projection.

## Removed surfaces

Pin/unpin and curator are removed from the live architecture.

The replacement is:

```text
reflector + maintainer + recall
```

A future compression auditor is optional only if dogfooding or evals prove a gap.
It must not create a pinned observation pool or become synchronous compaction work.

## Small-cluster maintenance

The normal memory-bounding path is a background maintainer, not a full active-memory rewrite.

Trigger:

```text
every X new reflections recorded
```

Initial policy should be simple, e.g. X = 10. Use a bounded active-reflection cluster, initially a newest-reflection window.

Maintainer responsibilities:

- merge duplicate or near-duplicate active reflections
- combine local stale/current pairs
- compress completed local implementation trail into a durable current outcome
- no-op when no safe improvement exists

Maintainer v1 does not use tags, observation input, semantic search, pure deletion, or audit summaries. It must not retire refs outside its input cluster.

Replacement reflections cite direct parent `ref_*` ids only:

```text
ref_new.sources = [ref_old_a, ref_old_b]
```

Do not flatten ancestry into repeated `obs_*` source lists. Recall handles traversal depth.

Global full-memory rewrite is not the normal lifecycle. If retained, it is an automatic background emergency fallback after bounded maintainer bursts fail to recover a hard budget.

## Retirement event

Maintained/replaced reflections are normal reflections.
The rewrite/retirement event carries ids retired from active projection.

```ts
interface ReflectionsRewrittenEvent {
  id: string; // rw_*
  retiredReflectionIds: string[];
  newReflectionIds: string[];
  retainedSourceIds: string[];
  discardedReflectionIds: string[];
  discardedSummary?: string;
}
```

Retired reflections stay in ledger history and remain recallable by exact id.
They are hidden from active projection.

Hidden audit metadata is not rendered in active memory by default.

## Maintenance validation

Validator is deterministic. Bad output no-ops.

Hard checks:

- all ids are typed and valid
- every new reflection id is new and valid
- every replacement source id exists in the maintainer input cluster
- every new reflection has at least one source
- no invented sources
- no retired id outside the maintainer input cluster
- content is non-empty and single-line
- content length under limit
- reflection count under limit
- no exact duplicate content
- maintained projection is smaller than old projection, unless explicitly configured for repair-only mode
- in maintainer v1, every retired reflection is cited by at least one replacement reflection

Pure deletion may be revisited later; v1 avoids silent forgetting.

Semantic quality is evaluated by evals, not validator, except for deterministic hard cases.

## Maintenance no-op and backoff

Invalid or low-quality maintenance must be safe:

```text
no-op = keep old active memory unchanged, retire nothing
```

Do not retry the same cluster immediately by default.

Policy:

- record last failure reason
- report active-memory pressure in status
- retry when the active reflection set changes, or when the next threshold is reached
- if repeated failures occur, keep compaction working with larger active memory rather than losing information

Status should make this visible:

```text
Maintenance: blocked, last failure: <reason>
Active memory: 24k / 20k tokens
```

## Recall policy

Since observations and retired reflections are hidden, recall is the exact evidence path.

Recall traverses:

```text
ref_* -> ref_* -> obs_* -> source entries
ref_* -> obs_* -> source entries
obs_* -> source entries
```

Recall accepts exact `obs_*`, `ref_*`, or legacy 12-character ids only.
It is not semantic search.

Rendering modes:

```text
evidence   = requested memory, provenance ids, terminal observations, source entries
provenance = evidence mode plus intermediate reflection contents
```

`depth` can explicitly limit ref-to-ref traversal.
Rendered source output and details are bounded.
Assistant thinking and assistant tool-call payloads are not exposed.

Active memory is for orientation.
Recall is for evidence.

Agent should recall before relying on memory for:

- exact paths
- exact commands
- exact errors
- API names/signatures
- config/schema names
- pass/fail claims
- stale/current fixes
- user constraints/preferences with implementation impact
- explanations of why something is believed

Active rewritten reflections must preserve useful handles so the assistant knows what to recall.
Hidden audit manifests are for audit/debug, not normal agent behavior.

## Compaction behavior

Compaction remains near-instant.

Compaction hook should do only:

```text
1. observer-only tail flush if needed
2. deterministic projection render
3. replacement summary return
```

No synchronous reflector, curator, auditor, or rewrite during compaction.

Compaction summary renders current active reflections only. It may include minimal metadata/status, but not observations, retired reflections, or discarded audit summaries by default.

Information is preserved by the ledger and recall, not by rendering all evidence in compaction summary.

## Information-loss model

Two different risks:

### Evidence loss

Should not happen.

Mitigation:

```text
source entries, observations, old reflections, and rewrite events remain in ledger
```

### Discoverability loss

Main risk.

A fact may remain in the ledger but disappear from active memory, so the agent does not know to recall it.

Mitigation:

- conservative maintainer prompt
- hard maintenance validation
- strong maintainer evals
- recall policy
- no-op on bad maintenance
- emergency rewrite evals if a global fallback remains

Maintainer replacements must preserve the local decision-relevant handles in their input cluster. Emergency rewrite, if retained, must preserve decision-relevant handles globally, not every old reflection id.

Decision-relevant handles include:

- current blockers
- unresolved-vs-fixed status
- user constraints/preferences
- exact commands/paths/errors/config/API names needed for future work
- stale/current relationships
- decisions not to do something
- durable architecture decisions

Noise, duplicate summaries, stale failed attempts, and routine meta chatter may be discarded from active memory.

## Evals and automatic maintenance

Automatic maintainer scheduling is now enabled as the normal cleanup path after realistic local evals showed safe no-op and acceptable local maintenance quality. Continue treating evals as regression gates for prompt/contract changes.

### Deterministic tests

- valid maintenance applies
- invalid ids no-op
- invented sources no-op
- retiring refs outside the input cluster no-op
- empty sources no-op
- too many/too long reflections no-op
- failed maintenance leaves active memory unchanged
- successful maintenance keeps retired refs recallable
- recall traverses maintained ref -> old ref -> obs -> source

### Model evals

- duplicate local refs merged correctly
- noisy duplicate local refs merged correctly
- stale/current pair maintained correctly, including unlabeled stale/current pairs
- completed trail compressed into current outcome
- completed trail with unresolved sibling preserves blocker status
- unrelated and partial-overlap clusters no-op
- exact command/error/path retained or recallably anchored
- provenance uses direct parent refs
- active memory shrinks locally
- invalid/unsafe maintenance no-ops

### Historical evals

Use giga-session-derived local clusters and emergency global slices:

- recent-reflection windows
- duplicate/stale-current clusters
- 30/100/final large reflection pools only for emergency rewrite/stress coverage

Track:

- pass/fail hard checks
- partial semantic score
- no-op rate
- shrink ratio
- token cost
- latency
- retained exact evidence

## Current implementation status

Implemented:

- typed ids and typed `sources`
- active projection as current reflections only
- legacy normalization at read boundaries
- removed pin/unpin and curator live surfaces
- observer source-only input
- reflector pending-observation input
- maintainer as normal bounded cleanup path
- rewrite as rare over-budget emergency fallback
- retirement event and retired-reflection recall
- recall traversal for typed ids and ref-to-ref chains
- recall `mode: "evidence" | "provenance"`
- realistic OM eval suite with judge scoring

Current follow-up work:

- dogfood OM before further reflector prompt tuning
- improve telemetry/status for maintenance, rewrite skips, and memory quality/cost
- revisit OM plus fork context handoff after docs and telemetry cleanup
