# pi-observational-memory

Pi extension for session-local observational memory.

It records compact observations/reflections from the current branch, preserves exact details like commands, paths, errors, decisions, and run results, and can expose that memory after compaction.

## Strategy

Configure under `observational-memory` in Pi settings:

```json
{
  "observational-memory": {
    "strategy": "additive"
  }
}
```

Strategies:

- `additive` — default. Use Pi's normal compaction, then add a small exact-detail memory patch after compaction.
- `replacement` — replace Pi compaction with an observational-memory summary.
- `off` — disable memory workers and memory compaction behavior.

OM does not schedule compaction. Pi/manual/eval compaction triggers still run; OM flushes memory at the compaction boundary and can replace or augment the resulting context depending on strategy.

## Useful options

```json
{
  "observational-memory": {
    "strategy": "additive",
    "observeEveryMessages": 32,
    "reflectEveryObservations": 4,
    "dropWhenActiveObservationsOver": 80,
    "protectRecentObservations": 32,
    "maxInitialObserveTokens": 100000,
    "additivePatchMaxTokens": 2000,
    "observerThinking": "low",
    "reflectorThinking": "xhigh",
    "dropperThinking": "xhigh",
    "debugLog": false
  }
}
```

`protectRecentObservations` keeps the newest active observations out of the dropper candidate set. Older observations become drop-eligible only after reflection review has covered their source range.

`maxInitialObserveTokens` prevents expensive backfill when the extension starts on an already-large session. It marks old history covered and observes future turns.

## Commands

- `/om:status` — show memory state.
- `/om:view` — show visible/full memory projection.

## Recall

Memory entries include 12-character ids. Use `recall(id)` when exact source context behind an observation or reflection is needed.

## Lifecycle

```text
source entries
  -> observer: source-backed observations, no relevance/lifecycle labels
  -> reflector: durable reflections or om.reflections.reviewed marker when review emits none
  -> dropper: lifecycle/safety choice over older reviewed observations outside protected recent window
  -> projection/rendering: reflections + active observations
```
