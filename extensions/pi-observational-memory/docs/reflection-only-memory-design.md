# Reflection-only active memory design

## Goal

Make OM bounded, cheap, and safe around compaction by separating durable evidence from active memory.

Core idea:

```text
ledger = durable truth
active memory = current reflections only
recall = exact evidence recovery
```

Observations are not prompt memory. They are background evidence used by reflector and recall. Rewrite may preserve `obs_*` provenance ids already present in active reflections, but it does not inject observation contents into rewrite context for now.

## Non-goals

- No semantic/search recall.
- No pinned observation pool.
- No per-reflection curator lifecycle by default.
- No synchronous rewrite/reflector/curator work during compaction.
- No backcompat requirement for pin/unpin behavior in this redesign. Readers should still tolerate old ledger events without crashing; old pin/unpin events are ignored rather than interpreted as active state.

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

Core fold/projection/recall/coverage code should use one shape. Do not keep parallel legacy projection, legacy pinning behavior, or feature-flagged old lifecycle paths.

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

Rewrite sources:

```text
obs_*
ref_*
```

`createdAt` is when the reflection record was produced. Stale/current reasoning should use source timestamps/order, not only rewritten reflection timestamps. A rewrite batch may create many reflections with the same `createdAt`; that is expected.

## Normal reflector contract

Normal reflector may read current reflections for context, but cites observations only.

Responsibilities:

- consume unreviewed observations and current reflections
- emit current active reflections sourced to `obs_*`
- preserve exact paths, commands, errors, ids, config names, and user constraints when they are durable anchors
- preserve stale/current relationships when relevant
- avoid meta/eval chatter unless it is a durable project decision
- mark observations reviewed only through successful reflection/no-reflection review

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

No raw/unreviewed fallback by default. If reflector lag or failures prove unsafe in evals or real sessions, add an explicit emergency fallback later. Do not silently reintroduce observation projection.

## Pinning and curator

Remove pin/unpin completely.

Remove current curator responsibilities tied to pinning:

```text
pin
unpin
pinned reviewed observations
visible reviewed observation pressure
```

Preferred replacement:

```text
reflector + rewrite + recall
```

Optional fallback only if evals prove needed:

```text
single-call low-thinking compression auditor
```

A compression auditor may request reflection repair. It must not create a long-lived pinned observation pool.

## Full active-memory rewrite

Rewrite bounds active reflection memory without per-item reflection lifecycle management.

Trigger:

```text
if projected active-memory tokens > budget
```

Projected active-memory tokens means rendered current active reflections. It does not mean total observation tokens or total ledger tokens.

Algorithm:

```text
1. Deterministically select all current active reflections.
2. Build rewrite input from active reflection summary lines only.
3. Ask LLM for a smaller set of normal Reflection records.
4. Mechanically validate output.
5. If valid, append rewrite event:
   - records new reflections
   - retires rewritten active reflections from projection
   - stores hidden audit metadata
6. If invalid, no-op and retire nothing.
```

Start with full rewrite of all current active reflections. Do not add observation-content expansion, clustering, or multi-phase rewrite unless evals show reflection-only one-pass rewrite is insufficient. Partial observation evidence can mislead stale/current reasoning, and full evidence can explode context.

## Rewrite event

Rewritten reflections are normal reflections. The rewrite event carries retirement and audit metadata.

```ts
interface ReflectionsRewrittenEvent {
  id: string; // rw_*
  retiredReflectionIds: string[];
  newReflectionIds: string[];
  retainedSourceIds: string[];
  discardedReflectionIds: string[];
  discardedSummary: string;
  failure?: undefined;
}
```

For failed attempts, record status/debug separately or as a failed rewrite event if useful:

```ts
interface ReflectionsRewriteFailedEvent {
  id: string; // rw_*
  candidateReflectionIds: string[];
  reason: string;
  details?: unknown;
}
```

Hidden audit metadata is not rendered in active memory by default.

Accounting rule:

```text
retiredReflectionIds = retained old ref sources ∪ discardedReflectionIds
```

Where retained old ref sources are `ref_*` ids cited by new reflections or listed in `retainedSourceIds`.

## Rewrite validation

Validator is deterministic. Bad output no-ops.

Hard checks:

- all ids are typed and valid
- every new reflection id is new and valid
- every source id exists in the active reflection rewrite input or allowed provenance ids from those reflections
- every new reflection has at least one source
- no invented sources
- no retired id outside active candidate set
- retired-id accounting holds
- content is non-empty and single-line
- content length under limit
- reflection count under limit
- no exact duplicate content
- rewritten projection is smaller than old projection, unless explicitly configured for repair-only mode

Do not require every retired reflection to be cited by a new reflection. That would preserve noise forever and may prevent real compaction.

Semantic quality is evaluated by evals, not validator, except for deterministic hard cases.

## Rewrite no-op and backoff

Invalid or low-quality rewrite must be safe:

```text
no-op = keep old active memory unchanged, retire nothing
```

Do not retry immediately by default.

Policy:

- record last failure reason
- report active-memory pressure in status
- retry when the active reflection set changes, or after manual trigger if one is added later
- if repeated failures occur, keep compaction working with larger active memory rather than losing information

Status should make this visible:

```text
Rewrite: blocked, last failure: <reason>
Active memory: 24k / 20k tokens
```

## Recall policy

Since observations and retired reflections are hidden, recall becomes the exact evidence path.

Recall must traverse:

```text
ref_* -> ref_* -> obs_* -> source entries
ref_* -> obs_* -> source entries
obs_* -> source entries
```

Active memory is for orientation. Recall is for evidence.

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

No semantic/search recall is planned. Therefore active rewritten reflections must preserve useful handles. Hidden audit manifests are for audit/debug, not normal agent behavior.

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

- conservative rewrite prompt
- hard rewrite validation
- hidden audit manifest for debugging
- strong rewrite evals
- recall policy
- no-op on bad rewrite

Rewrite must preserve decision-relevant handles, not every old reflection id.

Decision-relevant handles include:

- current blockers
- unresolved-vs-fixed status
- user constraints/preferences
- exact commands/paths/errors/config/API names needed for future work
- stale/current relationships
- decisions not to do something
- durable architecture decisions

Noise, duplicate summaries, stale failed attempts, and routine meta chatter may be discarded from active memory.

## Evals required before automatic rewrite

Do not enable automatic rewrite until realistic evals show no-op is rare and quality is acceptable.

### Deterministic tests

- valid rewrite applies
- invalid ids no-op
- invented sources no-op
- retiring non-active refs no-op
- empty sources no-op
- too many/too long reflections no-op
- failed rewrite leaves active memory unchanged
- successful rewrite keeps retired refs recallable
- recall traverses rewritten ref -> old ref -> obs -> source

### Model evals

- stale/current pair rewritten correctly
- unresolved blocker not marked fixed
- exact command/error/path retained or recallably anchored
- noisy/meta reflections removed
- overlapping reflections merged
- provenance valid
- active memory shrinks
- invalid/unsafe rewrite no-ops

### Historical evals

Use giga-session-derived slices:

- 30 current reflections
- 100 current reflections
- final large reflection pool

Track:

- pass/fail hard checks
- partial semantic score
- no-op rate
- shrink ratio
- token cost
- latency
- retained exact evidence

## Implementation order

1. Finish and review this design spec.
2. Add typed-id/data-model helpers and deterministic projection tests.
3. Change projection to active reflections only.
4. Remove pin/unpin projection/status behavior.
5. Add reflection `sources` and `createdAt` migration in code.
6. Update recall traversal for typed ids and ref->ref chains.
7. Implement rewrite event, validator, no-op/backoff status.
8. Simplify reflector prompt/tools around observation-sourced reflections.
9. Remove curator or reduce it to disabled/minimal audit path.
10. Add hard realistic evals.
11. Enable automatic rewrite only after eval baseline is good.
