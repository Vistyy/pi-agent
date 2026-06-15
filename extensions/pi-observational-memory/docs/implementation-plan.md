# Implementation plan: lifecycle redesign

## Goals

Make OM less noisy, cheaper, more continuous, and safer around compaction.

Current direction:

1. Keep observer work closed for this pass unless real-session regressions reappear.
2. Treat observations as durable background evidence, not active memory.
3. Make active memory mostly current reflections.
4. Remove pin/unpin and collapse curator into the smallest possible compression-audit role, or fold it into reflector if evals support that.
5. Replace per-item reflection lifecycle with pressure-triggered full-memory rewrite: rewrite current reflections into a smaller current set, retire the old active set, and keep all old records recallable.
6. Make the real memory cap apply to projected active memory tokens.
7. Make recall a required safety path for exact evidence recovery.
8. Prefer low reasoning for observer/reflector/rewrite/auditor unless evals prove otherwise.

## Completed this redesign pass

- Additive mode removed; default strategy is `replacement`.
- Compaction uses an observer-only safety flush and does not block on full OM catchup.
- Context taxonomy exists: `contextProjection`, `nextContextProjection`, reviewed/unreviewed maintenance state.
- Observations are hidden from active context projection; active projection renders current reflections only.
- Follow-up flags use bounded free-text reasons and are implicitly resolved by later reflector review coverage.
- Typed memory ids are implemented for new records: `obs_*` observations and `ref_*` reflections.
- Reflection records now use `sources` typed provenance ids and carry `createdAt`.
- Ledger folding, projection, recall, and tools normalize old records at the read boundary only.
- Compaction summary/details render active reflections only and do not preserve an active observation pool.
- Curator runtime path, pin/unpin ledger events, pin config, curator config/status lines, and curator tests/evals were removed.
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
- Curator evals use hard-check + partial-score semantics.
- Reflector default thinking is `low`; current small reflector eval baseline passes at low with much lower cost than xhigh.

## Current lifecycle

Current implemented lifecycle is still transitional:

```text
source entries
  ↓
observer
  records typed observations as durable evidence
  ↓
reflector
  records typed active reflections and advances review coverage
  ↓
projection
  renders current active reflections only
```

Current implemented `Next context` is:

```text
current reflections
```

Remaining transitional code is follow-up/drop maintenance logic; it no longer defines active projection.

Target lifecycle is simpler:

```text
source entries
  ↓
observer
  records observations as durable evidence in the ledger
  ↓
reflector
  records active reflections backed by observation ids
  ↓
projection
  renders current active reflections only
  ↓
rewrite, when projected memory exceeds budget
  rewrites all current reflections into a smaller active reflection set
  retires the rewritten active set from projection
  preserves provenance through typed source ids
  ↓
recall
  recovers retired reflections, observations, and source entries when exact evidence is needed
```

Target active memory is:

```text
current active reflections
```

Observations are not active memory. They remain durable background evidence for reflector, rewrite, and recall.
No pinned observation pool. No normal unreviewed observation visibility. If reflector lag/failure proves unsafe, add an explicit small emergency raw tail later; do not assume one by default.

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

### Stage 1: Design spec for reflection-only active memory — done

Goal: write down the target architecture before more code churn.

Status: `docs/reflection-only-memory-design.md` now captures the reflection-only target, boundary-only legacy compatibility, typed ids, projection rules, rewrite plan, recall policy, and staged removal plan.

Decisions already made for the next design:

- Observations are durable evidence, not active projected memory.
- Pin/unpin should be removed completely, not merely de-emphasized.
- Curator should be removed, folded into reflector, or reduced to a single minimal compression-auditor role.
- Active projection should be current reflections only.
- Memory pressure should use projected active-memory tokens, not observation count and not the old `observationsPoolMaxTokens` semantics.
- Compaction should stay near-instant: observer-only tail flush at compaction boundary, no synchronous reflector/curator/rewrite.
- Rewrite should be background maintenance triggered before compaction when active memory exceeds budget.
- Rewrite should be safe-by-default: invalid/low-quality rewrite means no-op and retires nothing.
- No backcompat requirement for pin/unpin behavior in this redesign.

Open architectural questions to settle in the spec:

1. Exact typed id format, e.g. `obs_...`, `ref_...`, maybe `src_...` later.
2. Exact reflection record shape. Preferred direction:
   ```ts
   Reflection {
     id: string;
     content: string;
     sources: string[]; // typed ids, usually obs_* and for rewrite ref_* too
     createdAt: string;
   }
   ```
3. Normal reflector provenance rule:
   - normal reflector may read current reflections for context
   - normal reflector cites observations only
   - rewrite may cite observations and old reflections
   - only rewrite retires old active reflections
4. Raw observation fallback:
   - none by default
   - if reflector lag/failure proves unsafe, add an explicit emergency fallback later rather than silently projecting observations
5. Hidden rewrite audit manifest:
   - rewrite records retained vs discarded retired reflections for audit/debug
   - discarded retired reflections are not rendered in active memory
   - no semantic/search recall is planned; active memory must retain useful handles
6. Exact status language for ledger vs active memory vs recallable retired memory.

### Stage 2: Data model and projection rewrite — mostly done

Goal: make projection reflect the new architecture.

Tasks:

- [x] Introduce typed memory ids for observations/reflections.
- [x] Add `createdAt` to reflection records and model-facing rendering.
- [x] Replace `supportingObservationIds` with a single typed `sources` array in core paths.
- [x] Remove remaining pin/unpin state, events, curator projection/status language.
- [x] Stop showing unreviewed observations in normal active projection.
- [x] Keep observations in the ledger for reflector input, rewrite input, and recall.
- [x] Update compaction projection so summary renders active reflections only.
- [x] Keep compaction hook synchronous work limited to deterministic projection render; observer tail flush remains the intended boundary behavior.

### Stage 3: Reflector simplification and compression-audit replacement — in progress

Goal: preserve the safety benefits of curator without pinning or multi-phase curator cost.

Status: curator is no longer scheduled or configured, and pin/unpin behavior is gone. Remaining work is to harden the reflector contract/evals and decide whether a minimal compression auditor is still needed.

Tasks:

- Redefine reflector contract:
  - consume unreviewed observations and current reflections
  - emit active reflection records sourced to observation ids
  - preserve exact paths/commands/errors when they are durable anchors
  - retain stale/current relationships when relevant
  - avoid meta/eval chatter unless it is a durable project decision
- [x] Remove curator pin/unpin tools and lifecycle.
- Decide whether follow-up/flag behavior remains:
  - preferred minimal form: reflector self-repair through future observations and rewrite
  - fallback: one-call low-thinking compression auditor that can request reflector repair, not pin observations
- Ensure old curator safety cases are represented in future reflector/rewrite evals before deleting the old safety net.

### Stage 4: Full active-memory rewrite

Goal: bound active reflection memory without per-reflection lifecycle management.

Design:

```text
if active projection tokens > budget:
  deterministically build bounded rewrite input from all current active reflections
  include enough sourced observations and timestamps for stale/current reasoning
  ask LLM for a smaller set of normal reflection records
  mechanically validate output
  if valid: append rewrite event that records new reflections and retires rewritten active reflection ids
  if invalid: no-op, keep old active memory
```

Tasks:

- Add rewrite event that retires old active reflection ids and records new normal reflections.
- Do not make rewritten reflections a special shape; they are normal reflections with typed `sources`.
- Start with full rewrite of all current active reflections.
- Do not add multi-phase rewrite unless evals show one pass is insufficient.
- Add hidden rewrite audit metadata:
  ```ts
  {
    retiredReflectionIds: string[];
    newReflectionIds: string[];
    retainedSourceIds: string[];
    discardedReflectionIds: string[];
    discardedSummary: string;
  }
  ```
- Do not render discarded reflections or discarded summaries in active memory by default.
- On invalid/low-quality rewrite, no-op and retire nothing.
- After rewrite failure, back off instead of retrying immediately; status should report the last failure reason and active-memory pressure.
- Deterministic responsibilities:
  - pressure trigger and token accounting
  - rewrite input selection and hard caps
  - timestamp/order rendering
  - typed id validation
  - max reflection count/length validation
  - no invented sources
  - no retirement outside candidate set
  - apply/no-op semantics
  - retired id accounting: retired ids equal retained old-ref sources plus discarded ids
- LLM responsibilities:
  - semantic grouping
  - dense current synthesis
  - stale/current conflict resolution from evidence
  - exact anchor retention
  - dropping redundant/meta/noisy active memory

### Stage 5: Recall as required evidence path

Goal: make hidden observations and retired reflections safely recoverable.

Tasks:

- Ensure recall can traverse:
  ```text
  ref_* -> source ref_* -> obs_* -> source entries
  ref_* -> obs_* -> source entries
  obs_* -> source entries
  ```
- Improve recall output so provenance chains and timestamps are clear.
- Add agent policy text: use active memory for orientation, recall for exact evidence.
- Require recall before relying on exact paths, commands, errors, API names, stale/current fixes, or pass/fail claims from memory.
- Add unit tests for recall traversal before model evals.

### Stage 6: Hard realistic evals

Goal: prove the new architecture before trusting it.

Do this after the design/data/projection path is clear, not first.

Eval targets:

- Reflector replaces old curator safety:
  - current blockers are not lost
  - unresolved is not marked fixed
  - stale/current relationship is preserved
  - exact anchors survive as reflection text or recallable ids
- Rewrite quality:
  - 30-100 overlapping/noisy/stale reflections rewrite to a small current set
  - exact current decisions are retained
  - meta/eval chatter is removed unless durable
  - invalid rewrite no-ops
  - provenance ids are valid and sufficient for recall
- Recall behavior:
  - model decides to recall when exact evidence is required
  - model uses recalled source correctly
- End-to-end:
  - use historical/giga-session slices
  - track hard failures, partial scores, token cost, latency, active memory size, and retained exact evidence

## Deferred / conditional

- More observer eval hardening only if real sessions show observer regressions.
- Per-reflection deprecation/supersession is not the preferred path; use full active-memory rewrite unless evals prove item-level lifecycle is necessary.
- More config knobs only after evals prove a single policy is insufficient.
- After planned lifecycle/eval work, look at OM + fork interaction: use instant compaction and always-on memory to send compacted context to forked agents instead of full context, avoiding full uncached input cost.
