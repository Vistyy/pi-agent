# Implementation plan: bounded handoff memory

## Goal

Make OM a cheap, continuous, bounded handoff pipeline:

```text
source entries
  -> observer   extracts durable observations from source-only input
  -> reflector  synthesizes active reflections from current reflections + pending observations
  -> rewrite    compresses current reflections into smaller handoff memory
  -> projection renders active reflections, plus a tiny flushed observation tail after compaction
  -> recall     recovers exact evidence from obs_*/ref_* ids when needed
```

Core constraints:

- No OM agent receives full raw history by default.
- Observations are durable evidence, not normal active context.
- Reflections are active memory.
- Rewrite is the only intentional lossy compression step.
- Recall is the evidence path for exact details.
- Compaction stays near-instant and must not synchronously run reflector/rewrite.

## Stage contracts

### Observer

Role: source chunk -> durable evidence observations.

Contract:

- Input is the serialized source chunk only.
- No prior reflections or prior observations in model input.
- Output observations must be directly source-backed and cite source entry ids.
- Generic validation/tool receipts are not durable memory unless they prove a named result, blocker, current/stale status, or user-requested fact.
- Observer is intentionally dumb/extractive; dedupe and synthesis belong downstream.

Current status:

- Source-only observer stage is implemented.
- Remaining cleanup: simplify prompt/tool contract and remove stale prior-memory wording.

### Reflector

Role: current reflections + pending observations -> active memory reflections.

Contract:

- Input is current active reflections plus only unreflected/pending observations.
- It must not receive the full observation pool.
- It emits new active reflections sourced to observation ids.
- It should preserve user constraints, decisions, current state, blockers, exact anchors, and stale/current relationships.
- It may emit no reflections when pending observations add no durable active-memory value.

Current status:

- Pending-only observation input is implemented.
- Remaining cleanup: simplify prompt and remove review-era/impossible empty-array wording.

### Rewrite

Role: current reflections -> smaller active handoff memory.

Contract:

- Input is current active reflections only.
- Output is normal `ref_*` reflections with typed `sources`.
- Retired reflections stay recallable.
- Invalid or low-quality rewrite no-ops and retires nothing.
- Prompt should frame the task as handoff memory for a future LLM, not as generic dedupe.

Rewrite must include, when present:

- current user constraints, preferences, decisions, and corrections
- active project state
- unresolved blockers, deferred tasks, and next work
- exact identifiers needed to act later: paths, commands, errors, ids, settings, schema/API names
- stale/rejected/superseded relationships needed to avoid mistakes
- source ids sufficient for recall traversal

Rewrite should drop:

- duplicate or near-duplicate facts
- stale facts not needed to explain current truth
- procedural breadcrumbs
- generic acknowledgements
- validation receipts that do not affect future action

Current status:

- Rewrite worker, retirement event, backoff, and recall-through-ref chains are implemented.
- Remaining cleanup: rewrite prompt as handoff memory; harden evals against sparse critical fact loss and stale/current loss.

### Projection and compaction

Normal active context:

```text
current active reflections only
```

Compaction boundary behavior:

```text
before source entries disappear:
  force observer on disappearing tail
then render:
  current active reflections
  + tiny recent observed tail pending reflection
```

The flushed tail is a continuity patch, not normal observation projection.

Rules for flushed tail:

- include only observations produced by the forced compaction safety observe
- include only observations whose source entries are being cut from context
- hard cap count/tokens
- label clearly as pending reflection
- do not include the whole unreflected backlog
- remove once reflector covers it or on normal projection

Current status:

- Observer-only compaction safety flush is implemented.
- Normal projection is reflection-only.
- Remaining work: add the tiny flushed observation tail to compaction projection.

### Recall

Role: exact evidence recovery.

Contract:

- Recall is assistant-facing, not exposed to OM agents by default.
- Recall must traverse:

```text
ref_* -> source ref_* -> obs_* -> source entries
ref_* -> obs_* -> source entries
obs_* -> source entries
```

- Use active memory for orientation; use recall for exact evidence before acting on exact paths, commands, errors, API names, stale/current fixes, or pass/fail claims.

Current status:

- Typed ids and ref/obs traversal exist.
- Remaining work: polish recall wording and tests for rewritten-reflection output.

## Prompt design rules

Apply to observer, reflector, and rewrite:

1. State the handoff role: who consumes the output and why.
2. Prefer include-shaped instructions over long negative lists.
3. Keep negative rules only where they prevent observed failure modes.
4. Remove stale architecture terms: curator, pinning, reviewed/unreviewed, dropper, follow-up flags.
5. Do not ask the model to reason about hidden context it no longer receives.
6. Keep tool contracts honest: prompts must not ask for schema-invalid outputs.

## Input-bound rules

- Observer: source chunk only.
- Reflector: current reflections + pending observations only.
- Rewrite: current reflections only, with a deterministic cap if needed.
- Recall: exact id traversal with bounded excerpts.

Planned tests:

- observer call has no prior reflections/observations
- reflector receives pending observations, not all active observations
- rewrite receives active reflections only
- compaction projection includes only just-flushed tail observations
- normal projection never includes observations

## Eval hardening

Evals must enforce the architecture contract, not reward plausible summaries.

Pass condition target:

```text
deterministic invariants pass
+ semantic judge pass
+ score threshold
```

Needed rubric fixes:

- Reflector real cases must not expect one reflection per observation.
- Replace output-count expectations with explicit fact coverage.
- Replace literal keyword checks (`stale`, `deferred`) with semantic checks.
- Rewrite cases must test sparse but critical fact retention, not just compression size.
- Observer cases must test source-only extraction, generic-validation restraint, and proposal-vs-current distinction.

Needed hard cases:

- validation noise near a meaningful decision
- stale plan followed by accepted current correction
- pending observation already covered by current reflection
- pending observation supersedes a current reflection
- rewrite with sparse critical user constraint among noisy dominant theme
- rewrite preserving stale/current chain and recall provenance
- compaction tail continuity after forced observer flush

## Telemetry and status

Track enough real-session data to tune cost and quality.

Per stage:

- input counts: source entries, current reflections, pending observations
- output counts: observations/reflections
- token usage: input/output/cache/cost
- duration
- no-op/failure reason

Rewrite-specific:

- active reflection tokens / budget
- input reflection count
- output reflection count
- retired count
- compression ratio
- no-op/backoff reason

Status should expose:

```text
Pending reflection observations: N
Rewrite pressure: X / Y tokens
Recent compaction tail: N, when present
Last observer/reflector/rewrite cost
```

## Completed work

- Additive mode removed; default strategy is `replacement`.
- Typed ids implemented: `obs_*`, `ref_*`, typed `sources`.
- Reflection records carry `createdAt`.
- Legacy ledger/session records normalize at read boundary only.
- Observations hidden from normal active context projection.
- Active projection renders current reflections only.
- Curator, pin/unpin, follow-up flags, dropped observations, and reviewed markers removed from runtime/evals.
- Reflector default thinking is `low`.
- Rewrite worker and `om.reflections.rewritten` retirement event implemented.
- Rewrite backoff for unchanged failed/no-op active sets implemented.
- Recall traverses typed observation/reflection provenance.
- Observer source serialization is policy-based and bounded.
- Observer stage now sends source chunk only.
- Reflector stage now sends pending/unreflected observations only.
- Real-session OM eval fixtures and low-thinking suite exist.
- Judge-based OM eval scoring exists, but rubrics need hardening.

## Next work, recommended order

1. Simplify observer prompt/tool contract.
   - Remove `mark_observed_no_observations`.
   - Use `record_observations({ observations: [] })` for no durable observations.
   - Remove stale prior-memory and fork/delegation special-case wording.

2. Simplify reflector prompt.
   - Remove review-era wording.
   - Remove impossible empty-array instruction if schema remains non-empty.
   - Clarify current-reflections + pending-observations contract.

3. Reframe rewrite prompt as handoff memory.
   - Use include-shaped handoff sections/criteria.
   - Add sparse-critical-fact safeguard.
   - Avoid count-band requirements unless evals prove necessary.

4. Add compaction flushed observation tail.
   - Return/track observations created by forced compaction safety observe.
   - Render only that bounded tail in compaction projection.
   - Add tests for normal projection vs compaction projection.

5. Harden eval rubrics.
   - Remove reflector count bias.
   - Add semantic judge expectations for stale/current, deferred tasks, exact anchors, and sparse critical facts.
   - Require judge pass plus score threshold.

6. Add telemetry/status improvements.
   - Make real cost/quality tuning visible.

7. Optional later: structured reflection categories.
   - Defer data-model change unless one-line reflections plus better prompts/evals are insufficient.

## Deferred / conditional

- Exposing recall to OM agents is not planned. Static bounded input remains preferred.
- Semantic/search retrieval for reflector is not planned. Current reflections should carry active state; recall is for assistant evidence recovery.
- Per-reflection deprecation/supersession is not preferred; use full active-memory rewrite unless evals prove item-level lifecycle is necessary.
- More config knobs only after evals prove a single policy insufficient.
- Later follow-up: OM + fork interaction using instant compaction/always-on memory to send compacted context to forked agents instead of full context.
