# Implementation plan: lifecycle redesign

## Goals

Make OM less noisy, more continuous, and safer around compaction.

Priorities:

1. Compaction must not block on full OM catchup.
2. Additive mode should be removed.
3. Prompt context should be driven by review/context state, not pool pressure.
4. Curator should own cleanup, visibility, and follow-up after reflector review.
5. Recall should get model evals and UX review.
6. Reflection deprecation/supersede is low priority and last.

## Current implementation status

Implemented in the current plan branch:

- Additive mode removed.
- Default strategy changed to `replacement`.
- Compaction path changed to observer-only safety flush.
- Compaction path waits for in-flight memory work, then re-reads/recomputes the unobserved prefix.
- Review/context projection taxonomy is implemented: `contextProjection`, `nextContextProjection`, and reviewed/unreviewed classification from reflection review coverage.
- Reviewed observations are hidden from next context by default; unreviewed observations and pinned reviewed observations remain visible.
- Follow-up flags are implemented with bounded free-text reasons and are implicitly resolved by later reflector review coverage.
- Pin/unpin visibility state is implemented with bounded free-text reasons; dropped tombstones remain hard suppression.
- Curator agent skeleton is implemented with multi-action passes for pin, unpin, flag, drop, and no-action.
- Curator evals exist in `/home/syzom/.pi/agent/eval` and the latest curator baseline passed 8/8 after splitting deterministic membership/cap checks from semantic judging.
- `pnpm test` and `pnpm run typecheck` pass for the extension after these changes.

Superseded transitional work:

- Progressive soft cleanup thresholds. They were useful as an intermediate cleanup trigger, but normal cleanup now moves through curator continuation after reflector review.

Deferred/reconsider later:

- Default `reflectorThinking` downgrade from `xhigh` to `high`.
- Stuck-cursor force-advance refinements beyond the current implementation.

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
curator
  audits reviewed observations
  pins, unpins, drops noise, or flags reflection follow-up work
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

Do not synchronously run reflector/curator unless an explicit emergency path is added later.

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
pending flagged follow-ups   → carried forward until next reflector review covers the flag event
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

Replace normal cleanup triggers with a continuation rule:

```text
reflector records reflections or marks observations reviewed
  → curator audits the observations newly reviewed by that reflector run
```

Clean cutover rule:

```text
curator runs after reflector; do not run a separate cleanup agent in parallel
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

Add curator model setting:

```ts
curatorThinking
```

Remove old cleanup config once curator cleanup is scheduler-ready.

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
reflector synthesis/follow-up quality
curator context decisions
recall tool-use decisions
end-to-end replay behavior
```

Eval quality doctrine:

```text
hard evals are allowed and expected to fail
failures are signal, not regressions by default
do not weaken prompts, rubrics, or fixtures just to make a model pass
prefer real historical/session-derived slices over clean synthetic toy inputs
compact easy synthetic evals to smoke coverage only
make timing, evaluated-model token usage, judge usage, and failure reasons visible in run output
use an LLM judge when semantic judgment matters
use deterministic invariants only for hard safety/cap/membership constraints
```

For unclear failures, add a diagnostic follow-up prompt after the failed agent output. This should ask the model to explain why the desired behavior was not achieved and what evidence/prompt/context made the failure likely. This mirrors the pi-fork eval diagnostic pattern and is for improvement guidance, not pass/fail laundering.

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
1a: stop running reflector/curator in compaction path
1b: run observer only when compacted prefix has unobserved source entries
```

Current path:

```text
ensureMemoryUpdatedBeforeCompaction()
  → runMemoryUpdate()
  → observer
  → reflector
  → curator
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
flagged follow-ups         → pending
```

### Stage 3: Introduce reviewed/context projection model — done

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

### Stage 4: Curator cleanup and visibility lifecycle

Curator action vocabulary:

```text
pin reviewed observation       → force exact observation into next context
unpin reviewed observation     → stop forcing exact observation into next context
flag reviewed observation      → request reflector follow-up
drop reviewed observation      → tombstone low-value/noisy observation
```

Do not add a `cover` event yet. Reviewed + unpinned is the default omitted/covered state.

Do not add a separate `suppress` event yet. Existing `om.observations.dropped` is the hard durability tombstone.

Do not rewind cursors.

Implemented schema:

```text
om.observations.flagged
{
  observationIds: [...],
  reason: string // short one-line explanation for reflector follow-up, normalized/truncated, not deterministic routing
}

om.observations.pinned
{
  observationIds: [...],
  reason: string // short one-line explanation for forcing reviewed observations into next context
}

om.observations.unpinned
{
  observationIds: [...],
  reason: string // short one-line explanation for no longer forcing reviewed observations into next context
}
```

Projection rule:

```text
next context observations = unreviewed observations + pinned reviewed observations - dropped observations
```

Reflector receives pending flagged observations as follow-up input alongside normal unreviewed observations.

Pending means the flag event was appended after the latest reflector recorded/reviewed entry. Once a later reflector run records reflections or marks reviewed, earlier flags are implicitly handled; no separate resolved event exists yet.

### Stage 4a: Curator evals before lifecycle cutover — done, now needs hardening

Curator behavior is model judgment, not just ledger mechanics. Initial eval coverage exists before trusting pin/unpin/drop/flag decisions.

Deterministic tests cover mechanics:

```text
fold pin/unpin/drop/flag events
projection includes unreviewed + pinned reviewed
drop wins over pin/flag
pending flags resolve after reflector review
```

Model evals cover judgment:

```text
exact path/error missing from reflection      → flag + maybe pin
exact detail already captured in reflection   → no pin
old pinned failure superseded by passing run   → unpin old
user preference/current constraint            → do not drop
noisy transient logs                          → drop
reflection contradicts observation            → flag and keep visible
stale/current trap omitted by reflection       → flag/pin relation evidence
mixed reviewed pool                           → unpin stale fixed failure, protect unresolved blocker, drop only noise
many candidate pins                           → choose minimal pins
one-shot priority                             → prefer high-value safe actions over pure cleanup
```

Evals run separately from `pnpm test` because they require live model calls. The harness lives in `/home/syzom/.pi/agent/eval`; the latest synthetic curator baseline passed 8/8 with deterministic invariants plus semantic judging.

This passing result is not enough. The current agent-level evals are mostly clean synthetic probes. Keep at most one or two easy smoke evals per agent, then add hard historical/session-derived evals that may mostly fail on smaller models. A low pass rate on hard evals is acceptable and useful.

### Stage 5: Clean curator lifecycle cutover — done

Curator is the single cleanup/visibility agent.

Normal curator trigger:

```text
reflector records reflections or marks observations reviewed
  → curator audits the observations newly reviewed by that reflector run
```

Emergency trigger:

```text
visible observations > emergencyCurateWhenVisibleObservationsOver
```

Other triggers:

```text
unreviewed observations + pending flagged follow-ups >= reflectEveryObservations → reflector due
curator cursor backlog exists → curator due only as emergency/backlog repair, not normal threshold scheduling
```

Emergency trigger:

```text
visible observations > emergencyCurateWhenVisibleObservationsOver
```

Curator inputs must separate action authority from read-only judgment context:

```text
action candidates = reviewed observations the curator may pin/unpin/flag/drop
read-only context = current reflections + current pinned/flagged state + related/recent observations
```

Mechanical enforcement:

```text
curator tools accept only ids in candidateObservationIds
context-only observation ids are rejected by tools, not merely discouraged by prompt prose
rejection feedback should include exact rejected ids and reasons
curator tools remain multi-turn so the model can recover after a rejected call
```

Observer coverage safety follow-up:

```text
observer tool rejection feedback lists exact rejected sourceEntryIds and reasons
invalid observations do not advance observer coverage
source entries remain uncovered unless a valid observation records them or observer explicitly marks no observations
same-run observer retry is deferred; coverage safety and debuggable loss are first
status/debug should surface repeated observer failures later
```

Avoid `maxCuratorActionsPerRun` initially. Bound prompt/input size with a candidate window instead. Add a mutation cap later only if dogfood/evals show over-action.

Overflow rule:

```text
if more reviewed candidates exist than the curator candidate window,
remaining candidates stay eligible for the next curator run
```

Action application rules:

```text
drop wins over pin/flag
unpin removes forced visibility but does not drop evidence
flag requests reflector follow-up through normal reflector threshold
pinned reviewed observations stay in next context
```

The old soft cleanup threshold and normal pool trigger should disappear here.

### Stage 6: Hard historical evals, recall verification, and UX — next

Audited sessions show:

```text
0 recall tool calls
```

First verify whether Pi compaction `details` makes recall redundant in practice.

Then harden evals across OM:

- prune easy observer/reflector/curator evals to smoke coverage
- add hard historical curator evals from real reviewed observation pools, reflections, pins, flags, drops, and stale context
- add hard reflector evals for repair/follow-up synthesis under noisy historical observations
- add hard observer evals for exact schema/API/event extraction from messy source turns
- add recall/tool-use evals where the correct behavior is to recover exact evidence instead of trusting compressed near-matches
- add end-to-end replay evals from real session slices through observer → reflector → curator → projected context

Recall model evals:

- call recall when exact source evidence is required
- avoid recall when inline memory is enough
- recall after compaction
- recall with compacted/covered observations
- distinguish exact current detail from stale near-match in compressed memory

Keep deterministic recall lookup covered by normal tests.

Eval observability requirements:

```text
record evaluated-model token usage per case and summary
record evaluated-agent duration per case and summary
record judge token usage and judge duration when used
record deterministic failure reasons
record semantic judge failure reasons
preserve failed outputs for inspection
```

When a failure is hard to interpret from captured output, run a diagnostic prompt after the failed case. The diagnostic should explain likely causes of failure using the prompt, inputs, output, and expected behavior. It should not change the pass/fail result.

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
#1 sequential pipeline          partly fixed / revisit under clean curator lifecycle
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
   Mitigation: pins, recall, follow-up flags.

2. Curator becomes too important.
   Mitigation: keep inputs bounded to reviewed backlog + current reflections + recent active observations.

3. Compaction observer-only flush may miss unobserved data if observer fails.
   Mitigation: preserve source excerpts/details or fail safely when required observer flush cannot complete.

4. Curator cleanup may regress cleanup conservatism.
   Mitigation: deterministic lifecycle tests, emergency visible-pressure trigger, and hard curator evals from real sessions. Do not make evals easier to preserve pass rates.

5. Read-only curator context may tempt the model to act on non-candidate ids.
   Mitigation: curator tools must mechanically reject ids outside `candidateObservationIds`, return exact rejected ids/reasons, and allow same-run recovery.

6. Curator backlog may lag if candidate windows are too small.
   Mitigation: run curator after successful reflector work, keep overflow candidates eligible, and use emergency visible-pressure trigger.
