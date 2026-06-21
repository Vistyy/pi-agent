# Implementation plan: bounded handoff memory

## Goal

Make OM a cheap, continuous, bounded handoff pipeline:

```text
source entries
  -> observer    extracts durable observations from source-only input
  -> reflector   synthesizes active reflections from current reflections + pending observations
  -> maintainer  periodically performs small local reflection cleanup
  -> active memory renders reflections, plus temporary compaction handoff observations after a safety flush
  -> recall      recovers exact evidence from obs_*/ref_* ids when needed
```

Core constraints:

- No OM agent receives full raw history by default.
- Observations are durable evidence, not normal active context.
- Reflections are active memory.
- The maintainer is the normal intentional compression step; global rewrite, if kept, is only an emergency fallback.
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

### Maintainer

Role: small local reflection hygiene, not global memory rewrite.

Contract:

- Runs periodically in the background, initially after every X new recorded reflections.
- Input is a bounded cluster of active reflections, initially a newest-reflection window.
- Output is normal `ref_*` replacement reflections plus the input `ref_*` ids they retire.
- Retired reflections stay recallable.
- Replacement reflections cite direct parent `ref_*` ids; do not flatten transitive `obs_*` ancestry.
- Empty maintenance output is a valid no-op.
- Invalid output no-ops and retires nothing.

V1 maintainer may:

- merge duplicate or near-duplicate active reflections
- combine local stale/current pairs
- compress completed local implementation trail into a durable current outcome
- no-op when no safe improvement exists

V1 maintainer must not:

- reconsider all active memory
- retire refs outside its input cluster
- include observations in its input
- delete refs without replacement in v1
- use tags/topics
- emit audit summaries as memory

Current status:

- Implemented as the default local cleanup path.
- Runs after every 10 new reflections using a capped newest-window input.
- Stricter contract is implemented: non-noop maintenance retires 2-4 input refs, emits 1-2 replacements, and every replacement cites all retired direct `ref_*` parents only.
- Invalid or unsafe output is rejected and retires nothing.

### Active memory and compaction

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
  + compaction handoff observations from the forced flush, if any
```

Compaction handoff observations are a continuity patch, not normal active memory. They bridge the gap where compaction removes source turns before the async reflector has converted newly flushed observations into reflections.

Rules for compaction handoff observations:

- include only observations produced by the forced compaction safety observe
- run only when source entries being cut from context are not already covered by observation coverage
- include only observations whose source entries are being cut from context
- hard cap count/tokens
- label clearly as temporary bridge context pending reflection
- do not include the whole unreflected backlog
- do not appear in normal active memory

Current status:

- Observer-only compaction safety flush is implemented.
- Normal active memory is reflection-only.
- The tiny flushed observation handoff is rendered in compaction memory only.

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

Apply to observer, reflector, maintainer, and any emergency rewrite fallback:

1. State the handoff role: who consumes the output and why.
2. Prefer include-shaped instructions over long negative lists.
3. Keep negative rules only where they prevent observed failure modes.
4. Remove stale architecture terms: curator, pinning, reviewed/unreviewed, dropper, follow-up flags.
5. Do not ask the model to reason about hidden context it no longer receives.
6. Keep tool contracts honest: prompts must not ask for schema-invalid outputs.

## Input-bound rules

- Observer: source chunk only.
- Reflector: current reflections + pending observations only.
- Maintainer: bounded active-reflection cluster only; no observation input in v1.
- Emergency rewrite, if kept: current reflections only, background-only, after maintainer cannot recover budget.
- Recall: exact id traversal with bounded excerpts.

Planned tests:

- observer call has no prior reflections/observations
- reflector receives pending observations, not all active observations
- maintainer receives only its bounded active-reflection cluster
- compaction memory includes only just-flushed handoff observations
- normal active memory never includes observations

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
- Maintainer cases test local cleanup, direct-parent provenance, no-op safety, and blast-radius limits.
- Emergency rewrite cases test current architecture retention: reflection-only active memory, typed ids/`sources`, maintainer as normal cleanup, rewrite as emergency fallback, instant compaction, recall evidence path, and removed curator/pin surface.
- Observer cases must test source-only extraction, generic-validation restraint, and proposal-vs-current distinction.

Needed hard cases:

- validation noise near a meaningful decision
- stale plan followed by accepted current correction
- pending observation already covered by current reflection
- pending observation supersedes a current reflection
- maintainer preserving sparse critical user constraint in a noisy local cluster
- maintainer preserving stale/current chain and recall provenance
- compaction tail continuity after forced observer flush

## Telemetry and status

Track enough real-session data to tune cost and quality.

Per stage:

- input counts: source entries, current reflections, pending observations
- output counts: observations/reflections
- token usage: input/output/cache/cost
- duration
- no-op/failure reason

Maintainer-specific:

- new reflections since last maintenance
- active reflection tokens / budget
- input cluster reflection count
- output reflection count
- retired count
- compression ratio
- no-op/failure reason

Emergency-rewrite-specific, if kept:

- active reflection tokens / budget
- input reflection count
- output reflection count
- retired count
- compression ratio
- no-op/backoff reason

Status should expose:

```text
Pending reflection observations: N
Maintenance pressure: X / Y tokens
Recent compaction handoff observations: N, when present
Last observer/reflector error, when present
```

## Completed work

- Additive mode removed; default strategy is `replacement`.
- Typed ids implemented: `obs_*`, `ref_*`, typed `sources`.
- Reflection records carry `createdAt`.
- Legacy ledger/session records normalize at read boundary only.
- Observations hidden from normal active memory.
- Active memory renders current reflections only.
- Curator, pin/unpin, follow-up flags, dropped observations, and reviewed markers removed from runtime/evals.
- Reflector default thinking is `low`.
- Maintainer implemented as the default local cleanup path, with direct-parent provenance and hardened no-op/rejection behavior.
- Rewrite worker and `om.reflections.rewritten` retirement event implemented.
- Rewrite is retained only as an emergency over-budget fallback after normal maintenance.
- Rewrite safety hardened: direct input `ref_*` sources only, no unchanged/duplicate replacement content, no empty/invalid result application, and stage-level smaller-than-active/under-budget checks.
- Rewrite backoff for unchanged failed/no-op active sets implemented.
- Recall traverses typed observation/reflection provenance.
- Observer source serialization is policy-based and bounded.
- Observer stage now sends source chunk only.
- Reflector stage now sends pending/unreflected observations only.
- Real-session OM eval fixtures and low-thinking suite exist.
- Judge-based OM eval scoring exists; maintainer and emergency rewrite rubrics are hardened, while observer/reflector real-session cases still show residual failures.

## Next work, recommended order

1. Triage full-suite eval failures.
   - Default low-thinking smoke on 2026-06-21: 29/31 passed; failures were `observer-real-giga-32` optional score threshold and `reflector-real-giga-16-v2` churn/duplicate reflection quality.
   - `openrouter/openai/gpt-5.4-nano` low-thinking smoke on 2026-06-21: 21/31 passed; weak spots were observer prose filtering, reflector giga cases, multiple maintainer semantic-judge cases, and one rewrite current-reality judge case.

2. Simplify observer prompt/tool contract.
   - Remove `mark_observed_no_observations`.
   - Use `record_observations({ observations: [] })` for no durable observations.
   - Remove stale prior-memory and fork/delegation special-case wording.

3. Simplify reflector prompt/evals.
   - Remove review-era wording.
   - Clarify current-reflections + pending-observations contract.
   - Tighten real-session churn filtering and duplicate-current-memory behavior.

4. Add telemetry/status improvements.
   - Make real cost/quality tuning visible.

5. Optional later: structured reflection categories.
   - Defer data-model change unless one-line reflections plus better prompts/evals are insufficient.

## Deferred / conditional

- Exposing recall to OM agents is not planned. Static bounded input remains preferred.
- Semantic/search retrieval for reflector is not planned. Current reflections should carry active state; recall is for assistant evidence recovery.
- Tags/topics are deferred until maintainer cluster selection proves it needs them.
- Full active-memory rewrite is no longer the preferred normal lifecycle; if retained, it should be automatic emergency/background fallback only.
- More config knobs only after evals prove a single policy insufficient.
- Later follow-up: OM + fork interaction using instant compaction/always-on memory to send compacted context to forked agents instead of full context.
