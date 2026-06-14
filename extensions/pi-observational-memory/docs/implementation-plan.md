# Implementation plan: lifecycle redesign

## Goals

Make OM less noisy, cheaper, more continuous, and safer around compaction.

Current priorities:

1. Sanitize observer input aggressively before adding observer evals.
2. Add hard observer/reflector evals with token/cost budgets.
3. Target low reasoning for observer, reflector, and curator unless evals prove otherwise.
4. Redesign the confusing memory-size/full-fold threshold.
5. Improve emergency curator behavior so pressure actually reduces next context.
6. Defer recall evals/tuning until observer/reflector/curator costs are under control.
7. Keep reflection lifecycle last unless reflection count becomes the dominant context/cost risk.

## Completed tombstones

- Additive mode removed; default strategy is `replacement`.
- Compaction uses an observer-only safety flush and does not block on full OM catchup.
- Compaction waits for in-flight observer work, then re-checks the unobserved prefix before flushing.
- Context taxonomy exists: `contextProjection`, `nextContextProjection`, reviewed/unreviewed, pinned reviewed visibility.
- Reviewed observations are hidden from next context by default; unreviewed and pinned reviewed observations remain visible.
- Follow-up flags use bounded free-text reasons and are implicitly resolved by later reflector review coverage.
- Pin/unpin state exists; dropped tombstones remain hard suppression.
- Curator replaced dropper and can pin, unpin, flag, and drop observations.
- Curator runs after reflector or under visible-observation emergency pressure.
- Curator eval harness lives in `/home/syzom/.pi/agent/eval`; synthetic baseline and hard-4 work exist.
- Dropper code and eval routing were removed.

## Current lifecycle

```text
source entries
  ↓
observer
  records raw observations from source input
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

## Observer source input categories

Observer input is currently built from source ledger entries, not just chat messages.

Source entry types considered by observer coverage:

```text
message
custom_message
branch_summary
compaction
```

`message` entries are further rendered by role/subtype:

| Source | Current observer input behavior |
|---|---|
| user message | included, capped per entry |
| assistant message | included, thinking redacted, capped per entry |
| tool result | included with tool name/status and excerpt |
| bash execution | included with command/exit code/output excerpt |
| custom message | included, capped per entry |
| branch summary | included, capped per entry |
| compaction summary | included, capped per entry |
| `custom_message` ledger entry | included, capped per entry |
| `branch_summary` ledger entry | included, capped per entry |
| `compaction` ledger entry | included, capped per entry |

Current problem:

- Tool outputs are capped per result, but there is no global per-chunk cap.
- Compaction/branch summaries can be re-observed even though they are derived context, not new primary source.
- OM custom events can enter observer input through `custom_message` source entries.
- The observer prompt says to skip noise, but the model still pays to read the noise.

## Memory-size threshold problem

`observationsPoolMaxTokens` is misleading.

Current behavior:

- Status displays `Size` as observations + reflections.
- The `/ 20,000` denominator is `observationsPoolMaxTokens`.
- The actual full-fold trigger counts observations only.
- Crossing the threshold does not curate, drop, cap, or retire memory.
- It only changes compaction projection shape from incremental fold to full fold.

This needs redesign. The UI should not present an observation-only full-fold threshold as a memory-size cap.

## Remaining work

### Stage A: Observer input sanitization ← current

Goal: make observer cheap and dumb by reducing input before the model sees it.

Implemented groundwork:

1. Observer input is include-filtered to primary `message` entries.
2. User and assistant messages remain visible; assistant thinking is redacted.
3. Tool and bash results use policy-based sanitized rendering:
   - tool/status metadata
   - input summary when available
   - output char count
   - successful generic tool output is metadata-only by default
   - bash/error output uses bounded excerpts
   - configured delegation tools such as `fork` can keep full excerpts
   - omitted/truncated marker
4. Defaults:
   ```text
   observerToolResultSummaryMaxLines = 4
   observerToolResultErrorMaxLines = 20
   observerToolResultLineMaxChars = 300
   observerToolOutputPolicies = { fork: "full-excerpt" }
   ```
5. Derived/non-primary entries are skipped:
   - `compaction`
   - `branch_summary`
   - `custom_message`
   - custom/branch/compaction message roles
6. If a chunk has only skipped entries, observer coverage advances with zero observations so the cursor does not stall.
7. Observations may cite only rendered source ids.

Still open:

- Whether the small successful-tool line cap is enough to preserve useful validation/API facts without reviving edit/write churn.
- Whether to add a mode flag later; avoid it for now unless evals show the single policy is wrong.
- Whether to add a soft/hard output observation-count cap after baseline model evals.

### Stage B: Observer hard evals with token budgets

Write evals only after Stage A semantics are settled.

Cases should be historical/session-derived and check:

- exact durable facts survive sanitized input
- huge `read`/`bash` output is not required for normal observation
- acknowledgements/churn/noise are ignored
- duplicate observations are avoided
- invalid/invented source ids are rejected clearly
- low reasoning passes
- token ceiling is part of pass/fail

### Stage C: Reflector hard evals with token budgets

Reflector currently compounds observer volume into reflection volume.

Cases should check:

- fewer, denser reflections
- exact current decisions and corrections preserved
- stale/current relationships preserved
- no restating every observation
- follow-up flags resolved by corrective/additional reflection
- low reasoning passes
- token ceiling is part of pass/fail

### Stage D: Memory budget / full-fold / emergency pressure redesign

This needs a larger rethink, not just a rename or status wording fix.

Current problems:

- `observationsPoolMaxTokens` sounds like a memory cap but only controls compaction projection shape.
- Status compares observations + reflections against an observation-only threshold.
- The threshold does not trigger cleanup, curation, reflection retirement, or backpressure.
- Emergency curator pressure is count-based, not token-based.
- Reflections can grow large independently of observation pressure.
- Cursor-filtered curator candidates can make emergency pressure fire without giving curator enough actionable material.

Design questions:

1. What should the real bounded resource be: next-context tokens, observation tokens, reflection tokens, source-entry lag, or a combination?
2. Should token pressure force reflector first, curator first, both, or a separate lifecycle pass?
3. Should emergency curator see all reviewed visible/pinned candidates, not just since-cursor candidates?
4. Should reflection pressure trigger reflection deprecation/supersede earlier than planned?
5. What status lines make the lifecycle understandable without implying a fake cap?

Do not implement this as a small wording change. Revisit after Stage A-C cost work clarifies observer/reflector volume.

### Stage F: Reflection lifecycle, last unless needed sooner

143 reflections in a long session is a warning sign.

Possible future work:

- deprecate/supersede reflections
- merge duplicate reflections
- age out stale reflections only when newer reflections preserve the current relationship
- show reflection pressure in status

### Stage G: Recall evals and UX, deferred

Recall remains important, but comes after observer/reflector/curator cost and lifecycle pressure are under control.

Needed later:

- lookup mechanics tests
- model evals for deciding when exact source evidence is required
- UX/status around recalled evidence and provenance
