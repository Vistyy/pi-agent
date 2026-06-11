# Implementation plan: lifecycle redesign

## Goals

Make OM less noisy, more continuous, and safer around compaction.

Priorities:

1. Compaction must not block on full OM catchup.
2. Additive mode should be removed.
3. Prompt context should be driven by review/context state, not pool pressure.
4. Dropper should evolve into a curator.
5. Recall should get model evals and UX review.
6. Reflection deprecation/supersede is low priority and last.

## Current implementation status

Implemented in the current plan branch:

- Additive mode removed.
- Default strategy changed to `replacement`.
- Compaction path changed to observer-only safety flush.
- Compaction path waits for in-flight memory work, then re-reads/recomputes the unobserved prefix.
- `pnpm test` and `pnpm run typecheck` pass after these changes.

Rejected/reverted transitional work:

- Progressive dropper soft threshold.
- Default `reflectorThinking` downgrade from `xhigh` to `high`.
- Dropper-after-abort and stuck-cursor force-advance changes.

Those ideas should be reconsidered only if they still fit the reviewed/context lifecycle.

## Target lifecycle

```text
source entries
  ↓
observer
  records raw observations
  ↓
unreviewed observations
  included in next context by default
  ↓
reflector
  synthesizes meaning
  advances semantic review cursor
  ↓
reviewed observations
  hidden by default as covered
  ↓
curator/dropper
  audits reviewed observations
  pins, suppresses, or flags repair work
```

Prompt projection taxonomy:

```text
Context      = latest compacted OM memory currently injected after compaction
Next context = projection OM would write if compaction ran now
Ledger       = raw recorded OM events / full history
```

Next context should become:

```text
next context = current reflections
             + unreviewed observations
             + pinned reviewed observations
```

Reviewed non-pinned observations should be hidden by default but remain recoverable through ledger/provenance/recall.

## Compaction rule

Compaction should checkpoint OM state, not complete OM state.

Synchronous compaction work:

```text
flush observer only for source entries about to disappear
```

Do not synchronously run reflector/dropper/curator unless an explicit emergency path is added later.

Safety invariant:

```text
No source entry is compacted away unless its information is represented somewhere:
- observed into OM, or
- preserved in compacted summary/details, or
- compaction waits/fails safely.
```

Quality work is deferred:

```text
observed but unreviewed      → carried forward in next context/pending
reviewed but uncurated       → carried forward covered/pending
flagged repair observations  → carried forward pending repair
```

## Config direction

Move from pool thresholds to cursor thresholds.

Keep:

```ts
observeEveryMessages
reflectEveryObservations
stuckCursorMaxRetries
observerThinking
reflectorThinking
```

Replace/remove transitional pool trigger:

```ts
dropSoftActiveObservationsOver // remove
```

Replace normal dropper trigger with:

```ts
curateEveryReviewedObservations
```

Make pool pressure emergency-only:

```ts
emergencyCurateWhenVisibleObservationsOver
```

Add action bounds:

```ts
maxCuratorActionsPerRun
maxPinnedObservations
```

Rename eventually:

```ts
dropperThinking → curatorThinking
```

## Test/eval doctrine

```text
normal tests prove deterministic mechanics
model evals judge agent behavior
```

Normal tests:

```text
ledger folding
projection/context
compaction safety
cursor math
config/status
recall lookup mechanics
```

Model evals:

```text
observer extraction quality
reflector synthesis/repair quality
curator context decisions
recall tool-use decisions
```

Recall split:

```text
unit test: recall(id) returns correct evidence
model eval: assistant chooses recall when exact evidence is needed
```

## Staged work

### Stage 0: Remove additive mode

User does not use additive mode. Remove it before deeper compaction/context work to reduce projection surface area.

Known surface:

```text
src/index.ts
src/hooks/additive-context.ts
src/config.ts
src/session-ledger/render-patch.ts
tests/additive-context.test.ts
tests/session-ledger-render-patch.test.ts
README.md
```

Actions:

- Remove `STRATEGY.additive`.
- Default to `replacement`.
- Remove `additivePatchMaxTokens`.
- Remove additive hook registration.
- Delete additive-only rendering/tests.
- Update README.

Architecture findings affected:

```text
#6 additive patch budget → obsolete
#8 additive cross-compaction gap → obsolete
```

### Stage 1: Compaction observer-only sync flush

Change `ensureMemoryUpdatedBeforeCompaction()` so it does only the required observer flush for the compacted-away prefix.

Split into:

```text
1a: stop running reflector/dropper in compaction path
1b: run observer only when compacted prefix has unobserved source entries
```

Current path:

```text
ensureMemoryUpdatedBeforeCompaction()
  → runMemoryUpdate()
  → observer
  → reflector
  → dropper
```

Target path:

```text
ensureMemoryUpdatedBeforeCompaction()
  → wait for existing update if needed
  → re-read branch
  → recompute hasUnobservedCompactedPrefix
  → if compacted prefix has unobserved source entries:
       run observer only with forceObserveBeforeEntryId
  → return
```

Important: do not return early after waiting for in-flight work until the safety condition has been recomputed. The observer safety flush must not be skipped due to stale pre-wait state.

Notes:

- Keep safety invariant.
- Do not run `anyMemoryUpdateStageDue()` as a reason to do full sync work.
- Consider in-flight semantics carefully. Existing compaction path bypasses `launchMemoryUpdateTask()`.
- It may be acceptable to use a dedicated compaction observer phase instead of normal in-flight wrapper.

### Stage 2: Warm projection invariant

Observer-only compaction fixes latency, not semantic catchup.

Add an explicit invariant for fork/compaction consumers:

```text
normal lifecycle keeps projection warm enough most of the time
compaction does not perform full semantic catchup
fork agents consume the current warm projection
```

If lag is large, carry it forward explicitly:

```text
unreviewed observations → in next context/pending
flagged repairs         → pending
```

### Stage 3: Introduce reviewed/context projection model

Add ledger/projection support for reviewed observations being hidden by default.

Minimal model:

```text
active   = unreviewed + in context
covered  = reviewed + hidden by default
pinned   = reviewed + in context
```

Prompt projection:

```text
reflections + unreviewed observations + pinned reviewed observations
```

This is the main noise reduction.

Initial concrete rule:

```text
reviewed = observation is behind latest reflection review marker
```

Use existing markers first:

```text
om.reflections.recorded
om.reflections.reviewed
```

Do not add `om.observations.reviewed` until proven necessary.

Next-context rule:

```text
context observations to write = unreviewed active observations + pinned reviewed observations
hidden observations           = reviewed non-pinned observations + suppressed observations
```

Existing `om.observations.dropped` tombstones remain respected. New context decisions layer on top for mixed old/new sessions.

### Stage 4: Evolve dropper into curator

Curator actions:

```text
pin reviewed observation
cover reviewed observation
suppress observation
flag reviewed observation for re-review
```

Do not rewind cursors.

For repair:

```text
om.observations.flagged
{
  observationIds: [...],
  reason: "reflection_missing_exact_detail" | "possible_contradiction" | "important_exact_detail"
}
```

Reflector receives flagged observations as repair input alongside normal unreviewed observations.

### Stage 5: Rework triggers

Normal curator trigger:

```text
newly reviewed observations since curator cursor >= curateEveryReviewedObservations
```

Emergency trigger:

```text
visible observations > emergencyCurateWhenVisibleObservationsOver
```

Other triggers:

```text
flagged repair backlog exists → reflector due
suppression/context backlog exists → curator due
```

The current soft drop threshold should disappear here.

### Stage 6: Recall verification, evals, and UX

Audited sessions show:

```text
0 recall tool calls
```

First verify whether Pi compaction `details` makes recall redundant in practice.

Then add model evals for:

- call recall when exact source evidence is required
- avoid recall when inline memory is enough
- recall after compaction
- recall with compacted/covered observations

Keep deterministic recall lookup covered by normal tests.

Add evals from session `019eb6fe-2e4e-732f-b744-4b2cb3123d70` failure:

- Observer eval: preserve exact durable schema/API/event names from implementation plans, not only high-level concepts.
- Recall/tool-use eval: before implementing durable schema, re-read docs or recall exact evidence when memory lacks exact names.
- Reasoning eval: distinguish agreed concept from proposed API.

Concrete missed event names from that session:

```text
om.observations.flagged
om.reflections.deprecated
om.reflections.superseded
```

### Stage 7: Reassess architecture findings

After lifecycle/additive/compaction changes, update:

```text
/home/syzom/.pi/agent/docs/ARCHITECTURE_FINDINGS.md
```

Expected statuses:

```text
#1 sequential pipeline          partly fixed / revisit under curator lifecycle
#2 observer validation gaps     still open
#3 initial backfill skip        still open
#4 compaction blocks LLM work   fixed by Stage 1
#5 compaction in-flight guard   reassess with Stage 1 implementation
#6 additive budget              obsolete after Stage 2
#7 recall after compaction      covered by Stage 6
#8 additive gap                 obsolete after Stage 2
#9 stuck cursor                 partly fixed, may need better retry semantics
#10 reflections append-only     low priority, last
```

### Stage 8: Reflection lifecycle, low priority / last

Do last.

Potential additions:

```text
om.reflections.deprecated
om.reflections.superseded
reflection merge/compaction pass
```

Reason for low priority:

- Reflections are fewer and smaller than observations.
- Growth is slower.
- Current pain is observation noise and compaction stalls.

## Main risks

1. Hiding reviewed observations by default may hide exact details too aggressively.
   Mitigation: pins, recall, repair flags.

2. Curator becomes too important.
   Mitigation: keep inputs bounded to reviewed backlog + current reflections + recent active observations.

3. Compaction observer-only flush may miss unobserved data if observer fails.
   Mitigation: preserve source excerpts/details or fail safely when required observer flush cannot complete.

4. Migration from `dropped` tombstones to context decisions may be messy.
   Mitigation: maintain backward compatibility in fold/projection while adding new events.
