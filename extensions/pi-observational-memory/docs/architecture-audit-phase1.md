# Observational Memory architecture audit — phase 1

## Actual extension entry flow

```text
index.ts
  -> new Runtime()
  -> registerConsolidationTrigger()
  -> registerCompactionTrigger()
  -> registerCompactionHook()
  -> registerAdditiveContext()
  -> registerStatusCommand()
  -> registerViewCommand()
  -> registerRecallTool()
```

This is clear at the root, but the registered hooks overlap in lifecycle responsibility.

## Runtime state

```text
Runtime
  config / configLoaded
  consolidationInFlight / consolidationPromise / consolidationPhase
  compactHookInFlight
  resolveFailureNotified
  lastObserverError / lastReflectorError / lastDropperError
```

Assessment:

```text
mostly useful
but multiple in-flight flags make lifecycle hard to reason about
```

Risk:

```text
consolidation and compaction interact across async hooks:
  message_end / turn_end / agent_start launch background work
  session_before_compact waits/runs inline work
  agent_end may trigger compaction later with setTimeout
```

## Event hooks and responsibilities

```text
agent_start/message_end/turn_end
  consolidation-trigger.ts
    maybeLaunchConsolidation()
      if anyStageDue()
        background runConsolidationPipeline()

session_before_compact
  compaction-hook.ts
    await ensureConsolidatedBeforeCompaction()
    if strategy=replacement:
      buildCompactionProjection()
      renderSummary()
      return custom compaction

before_agent_start
  additive-context.ts
    if strategy=additive and branch has compaction
      fullProjection()
      renderMemoryPatch()
      append patch to system prompt
```

Visual:

```text
messages/events
  -> consolidation trigger
      -> observer -> reflector -> dropper -> custom ledger entries
  -> compaction trigger
      -> ctx.compact()
          -> session_before_compact
              -> flush consolidation
              -> replacement summary OR Pi default summary
  -> next agent start
      -> additive patch if additive strategy
```

Overlap:

```text
compaction-hook decides what compaction contains
consolidation-trigger decides when memory records exist
additive-context decides post-compaction augmentation
```

This is functional but scattered.

## Data flow

```text
Pi branch entries
  -> serializeSourceAddressedBranchEntries()
      source types: message, custom_message, branch_summary
      includes user text
      includes assistant text/thinking/toolCall placeholders
      includes toolResult text
  -> observer
      appends custom om.observations.recorded
  -> reflector
      appends custom om.reflections.recorded
  -> dropper
      appends custom om.observations.dropped
  -> fold/projection
  -> render summary/patch
```

Ledger entry types:

```text
om.observations.recorded
  { observations, coversUpToId }

om.reflections.recorded
  { reflections, coversUpToId }

om.observations.dropped
  { observationIds, coversUpToId }

compaction.details for OM replacement
  { type: om.folded, fullFold, observations, reflections }
```

## Source serialization behavior

Current `serialize.ts` behavior:

```text
user:
  text blocks only

assistant:
  text + unredacted thinking + toolCall placeholders

toolResult:
  text blocks, full text as available

custom_message:
  text only for normal serialization

branch_summary:
  full summary text
```

Important:

```text
Observer can see tool result text directly.
There is no bounded excerpt policy here yet.
```

Risk:

```text
large/noisy tool results can dominate observer input
observer can infer from raw tool output, not just main-agent conclusions
```

## Consolidation pipeline

```text
runConsolidationPipeline()
  observer stage
  reflector stage
  dropper stage
```

### Observer stage

Due check:

```text
sourceEntryCountSinceObservationCoverage(entries) >= observeEveryMessages
```

Input:

```text
source entries after latest observation coverage marker
prior reflections rendered as lines
prior observations rendered as lines
serialized raw chunk
```

Output:

```text
om.observations.recorded
```

Special case:

```text
if first backfill exceeds maxInitialObserveTokens:
  append empty observations_recorded coverage marker
  skip backfill
```

Assessment:

```text
core value path
but due trigger is token-based and source chunk can include huge tool results
```

### Reflector stage

Due check:

```text
new active observations since reflection coverage >= reflectEveryObservations
and latest observation coverage marker exists
```

Input:

```text
foldLedger(entries).reflections
foldLedger(entries).activeObservations
```

Output:

```text
om.reflections.recorded, if model calls record_reflections
```

Assessment:

```text
conceptually useful
currently semantically confused:
  prompt says durable/long-lived and checkpoint/current-state at same time
observed eval runs emitted 0 reflections
```

### Dropper stage

Runs only when:

```text
sameRunReflectionCoverageId exists
sameRunReflections.length > 0
active observation pool over target tokens
```

Input:

```text
folded.activeObservations
folded.reflections + sameRunReflections
observationPoolTargetTokens
```

Output:

```text
om.observations.dropped
```

Assessment:

```text
dropper cannot run usefully unless reflector emits in the same pipeline run
this makes dropper dependent on same-run reflections, not just existing reflection coverage
```

This is a key architecture smell.

## Fold/projection behavior

### foldLedger

```text
root -> boundary
first valid observation id wins
first valid reflection id wins
drops are tombstones
activeObservations = observations - dropped ids
```

Clear and reasonable.

### projection.ts

Main functions:

```text
fullProjection(entries)
  all observations/reflections/drops through tip or boundary

visibleProjection(entries)
  if no boundary:
    latest compaction OM details if present
  else:
    buildCompactionProjection(...)

buildCompactionProjection(entries, firstKeptEntryId, config)
  normalProjection:
    observations through tip
    reflections only through latest full-fold compaction boundary
    drops only through latest full-fold compaction boundary
  if observation tokens >= observationsPoolMaxTokens:
    fullProjection through firstKeptEntryId
  details = rendered memory stored in compaction details
```

Important behavior:

```text
observations before compaction are included through tip
reflections/drops may lag unless a fullFold happens
```

Assessment:

```text
non-obvious and likely too clever
normal projection intentionally includes new observations but not all new reflections/drops
fullFold is token-triggered maintenance behavior
```

This needs simplification or very clear tests/docs.

## Rendering behavior

### Replacement

```text
compaction-hook.ts
  summary = renderSummary(projection.reflections, projection.observations)
```

`renderSummary`:

```text
instructions
optional ## Reflections
optional ## Observations
```

Current reality:

```text
if reflector emits nothing:
  replacement summary is observations-only
```

### Additive

```text
before_agent_start after any compaction
  fullProjection()
  renderMemoryPatch(maxTokens=additivePatchMaxTokens)
  append to system prompt
```

Patch prioritizes observations:

```text
critical/high first
then status/detail heuristics
then reflections after observations
```

Assessment:

```text
additive is explicitly an exact-detail patch
replacement is full memory rendering
both mostly prioritize observations over reflections today
```

## Status command behavior

`om:status` shows:

```text
strategy
observations recorded/dropped/active/visible
reflections recorded/visible
next observation/reflection/compaction token progress
visible/active pool token counts
in-flight phase/errors
```

Assessment:

```text
useful debugging surface
but exposes token-watermark mental model deeply
```

## Complexity classification

### Essential now

```text
src/index.ts
src/runtime.ts
src/config.ts
src/serialize.ts
src/hooks/consolidation-trigger.ts observer path
src/hooks/compaction-hook.ts
src/hooks/additive-context.ts
src/session-ledger/types.ts
src/session-ledger/fold.ts
src/session-ledger/projection.ts
src/session-ledger/render-summary.ts
src/session-ledger/render-patch.ts
src/session-ledger/recall.ts
src/agents/observer/*
```

### Useful but unclear / not proving value yet

```text
src/agents/reflector/*
src/agents/dropper/*
src/agents/dropper/coverage.ts
src/agents/dropper/pool.ts
```

### High-risk / overcomplicated

```text
rawTokensSince*Coverage progress model
projection fullFold / maintenanceBoundary behavior
same-run-only dropper gate
long/conflicting reflector prompt
full tool result serialization
multiple async lifecycle flags
```

## Initial architecture problems

### 1. Memory semantics are unclear

Current names imply:

```text
Observation = exact event/evidence
Reflection = durable long-term conclusion
```

Replacement compaction needs:

```text
Reflection = session checkpoint fact
```

These conflict.

### 2. Dropper depends on reflector in same run

```text
reflector emits nothing -> dropper never runs
existing reflections alone do not trigger dropper stage
```

This couples pruning to a successful same-run reflection, making it fragile.

### 3. Token watermarks drive everything

```text
observe due = raw tokens since coverage
reflect due = raw tokens since coverage
compact due = raw tokens since last compaction
pool full = observation tokens
```

This is simple mechanically but poor as workflow representation.

### 4. Projection rules are hard to explain

Especially:

```text
observationsBoundary: tip
reflectionsBoundary: latest full-fold boundary or none
dropsBoundary: latest full-fold boundary or none
```

This can make memory visibility differ from ledger state in surprising ways.

### 5. Replacement currently equals observation-ledger compaction

Because reflections are absent in observed runs:

```text
replacement summary = instructions + observations
```

That may be acceptable, but it should be explicit rather than accidental.

## Suggested cleanup sequence

No concept deletion yet.

```text
1. Write source-backed architecture docs/tests for current lifecycle.
2. Rename/clarify semantics in code comments:
   Observation = evidence
   Reflection = checkpoint fact backed by observations
   Drop = tombstone for covered evidence
3. Simplify reflector prompt around checkpoint facts; remove durable/long-lived conflict.
4. Decouple dropper from same-run reflections; allow dropper when existing coverage + pool over threshold.
5. Reconsider progress model:
   message/count-based due checks + token caps as safety.
6. Simplify projection or document/test fullFold boundary behavior heavily.
7. Add serializer policy tests before changing tool-result handling.
```

## Immediate next coding target

Best first hardening change:

```text
clarify reflector as checkpoint summarizer and update tests so it must emit reflections for current-session exact/current/stale observations
```

Why first:

```text
keeps reflector/dropper concepts
addresses observed 0-reflection issue
low architectural blast radius
can be validated with unit tests only
```
