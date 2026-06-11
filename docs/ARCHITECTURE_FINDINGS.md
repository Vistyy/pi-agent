# Architecture findings to revisit

Context: notes from comparing five model reviews of `pi-observational-memory` across repo revisions. Not fixes yet. Use this as a triage list.

## High-value findings

### 1. Sequential pipeline couples unrelated failures

Current memory update order is:

```text
observer -> reflector -> dropper
```

If observer aborts, reflector/dropper do not run. If reflector aborts, dropper does not run. This means a temporary observer/model failure can prevent pruning even when active observations are already over the drop threshold.

Potential direction: decouple stage scheduling. Let each stage run when its own guards are satisfied.

### 2. Observer validation can create permanent gaps

Observer chunks are marked covered via `coversUpToId`. If a model output is partially/fully rejected during validation, coverage can still advance, so rejected facts from that chunk may never be retried.

Risk: silent data loss from one-shot observer tool output.

Potential direction:
- accept valid subsets where safe;
- do not advance coverage when the output was invalid enough to lose meaningful data;
- add debug/status visibility for rejected observations.

### 3. Initial large-session backfill skip is permanent

If initial source history exceeds `maxInitialObserveTokens`, the observer records an empty coverage marker and observes only future turns.

This is intentional for cost control, but it is a large permanent memory gap when OM is added mid-project.

Potential direction:
- add explicit user opt-in command for chunked backfill;
- record clearer status that pre-OM history was intentionally skipped;
- maybe preserve a coarse marker in compaction summaries.

### 4. Compaction hook can block on LLM work

`session_before_compact` calls `ensureMemoryUpdatedBeforeCompaction()`, which can synchronously run observer/reflector/dropper before compaction proceeds.

Risk: long UI stalls, especially reflector with high thinking.

Potential direction:
- keep only required pre-compaction observer flush synchronous;
- defer reflector/dropper;
- add timeout/skip behavior with visible status.

### 5. Compaction-triggered update bypasses normal in-flight wrapper

The compaction path calls `runMemoryUpdate()` directly rather than via `launchMemoryUpdateTask()`. During that path, `memoryUpdateInFlight` may not represent the active compaction-triggered update.

Risk: duplicate/concurrent memory updates if other lifecycle events fire during compaction.

Potential direction:
- route compaction-triggered updates through the same runtime guard;
- or add a dedicated `compactionMemoryUpdateInFlight` guard.

### 6. Additive patch budget may under-prioritize reflections/recent info

Reviewers flagged that `renderMemoryPatch()` may fill budget with observations before reflections, and/or older observations before recent ones.

Risk: high-level durable reflections or recent details may be omitted from the limited `additivePatchMaxTokens` patch.

Potential direction:
- render reflections first;
- reserve separate budgets for reflections vs observations;
- prioritize recent observations or high-value observations.

### 7. Recall may degrade after compaction

The recall tool depends on source entry IDs. After compaction, exact source entries may be unavailable or reduced, depending on what remains in the branch.

Risk: recall is most needed after compaction, but source evidence may be missing then.

Potential direction:
- test recall after replacement/additive compaction;
- store enough source excerpts/evidence in memory details if exact source entries will disappear;
- make recall result explicit about full vs compressed evidence.

### 8. Additive mode may silently lose cross-compaction memory (highest impact)

From session `019eae4b`, MiniMax M3.

`additive-context.ts` calls `fullProjection(entries)`, which folds only entries whose
`coversUpToId` still resolves in the current branch. After compaction removes source
entries, prior `om.observations.recorded` coverage pointers may dangle, and the additive
patch returns empty until new post-compaction observations accumulate.

The `replacement` strategy escapes this via `latestCompactedProjection()` which reads
`compaction.details`. The `additive` strategy has no equivalent read-side anchor.

Risk: user-visible cross-compaction memory gap masked as a feature.

Potential direction:
- `additive-context.ts` should compute `mergeProjection(latestCompactedProjection, fullProjection)`;
- or rewrite `coversUpToId` to the compaction entry id when sealing a prefix;
- or fold should treat OM entries as covering their own data without resolving `coversUpToId`.

Note: needs runtime confirmation of exact Pi compaction behavior (which custom entries
survive). The code-path concern is real regardless.

### 9. Stuck cursor: no-tool-call can create a cost-amplification loop

From session `019eae4b`.

If observer/reflector returns no valid tool call, the cursor does not advance. On every
subsequent lifecycle event the same chunk is retried. No backoff, no rate limit, no
escalation.

Risk: silent cost amplification. Combined with event triggers (agent_start / message_end
/ turn_end), a stuck cursor can retry on every turn.

Potential direction: cap consecutive aborts per chunk, notify user, add `/om:reset`
or explicit skip-cursor command.

### 10. Append-only reflections can become stale (extends to all strategies)

Reflections are append-only. There is no explicit supersede/retract mechanism for decisions
that later change. This also affects the additive patch and replacement summary: outdated
reflections accumulate forever, and the reflection list grows monotonically, increasing
reflector prompt size and cost over long sessions.

Risk: stale reflections pollute future prompts/projections.

Potential direction:
- add `om.reflections.deprecated` tombstone entry;
- teach reflector to emit replacement relationships;
- render newer conflicting reflections preferentially.

### 11. Observer may re-observe compaction summaries

From session `019eb7fa`, Kimi K2.6.

`isSourceEntry()` includes `"compaction"`, so observer source chunks can include prior compaction summaries. The observer already receives prior observations/reflections as memory context, so re-processing compaction entries may create redundant or meta-observations about already-compressed memory.

Risk: feedback loop where memory summaries become new evidence, increasing duplication and drift.

Potential direction:
- exclude `compaction` from observer source entries;
- or treat compaction entries as source only for recovery/full-fold paths, not normal observation;
- add tests for post-compaction observation chunks.

## Medium/low-value findings

### No per-run observer token cap after initial backfill

From session `019eb7fa`.

`maxInitialObserveTokens` protects only the first no-coverage backfill. Later observer chunks can still become very large if updates are delayed or the cursor gets stuck.

Risk: unexpectedly large observer prompts/cost after the initial session phase.

Potential direction: add `maxObserveTokensPerRun`, chunk large source ranges, or force smaller cursor advancement.

### Reflector newline validation may drop otherwise good reflections

From session `019eb7fa`.

Reflections are required to be single-line. If model output includes newlines in reflection content, validation can reject the reflection. Need verify whether rejection is per-reflection or can poison the whole batch in the current agent implementation.

Risk: useful reflections lost due to formatting rather than substance.

Potential direction: normalize whitespace/newlines to spaces before validation, or report rejected reflection counts in debug/status.

### Dropper throughput cap may lag under load

`derivedMaxDropCount()` caps drops per run. If observations grow much faster than dropper runs, active count can stay above target for several cycles.

Potential direction: cap by excess over target, not only percentage/max 10.

### Single-shot stage contract is brittle

From session `019eae4b`.

Each stage gives the LLM two terminating tools. If the model hallucinates a tool name
(`record_observation` instead of `record_observations`) or runs out of turns before
calling, the outcome is indistinguishable from "reviewed with nothing." No retry, no
differentiation between "intentionally empty" and "model flaked."

Potential direction: retry once on no-tool-call, emit explicit "reviewed_no_progress"
marker, or add notification.

### Replacement summary budget is not model-aware

From session `019eae4b`.

`observationsPoolMaxTokens` is hardcoded to 20k regardless of active model's context
window. The OM replacement summary can be too small (underutilizing capacity) or too
large (forcing immediate re-compaction).

Potential direction: derive from model contextWindow minus prompt overhead.

### Config is loaded once per runtime

`Runtime.ensureConfig()` loads settings once. Mid-session config changes are ignored.

Potential direction: reload on session boundary or command, or check settings mtime.

### Error visibility/retry is limited

Stage errors are recorded in runtime state and UI notifications, but there is no persistent retry/backoff story beyond future lifecycle triggers.

Potential direction: persist last failure in ledger/status and expose retry command.

## Claims to treat cautiously

These came up in reviews but need verification before acting:

- Stale `transientCompactionObservations` / `transientCompactionReflections` across compactions. They are cleared at compaction start, so the exact stale-next-compaction claim may be false.
- Dropper being “decorative.” It is overstated; the LLM still selects candidate IDs, though deterministic sorting/capping overrides ordering.
- Hash collisions from 12-char IDs. Technically possible, likely not a practical session-local concern.
- Token estimation drift. Generic concern unless reproduced with actual model tokenizer limits.
