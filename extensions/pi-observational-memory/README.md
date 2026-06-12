# pi-observational-memory

Pi extension for session-local observational memory.

It records compact observations/reflections from the current branch, preserves exact details like commands, paths, errors, decisions, and run results, and can expose that memory after compaction.

## Strategy

Configure under `observational-memory` in Pi settings:

```json
{
  "observational-memory": {
    "strategy": "replacement"
  }
}
```

Strategies:

- `replacement` — default. Replace Pi compaction with an observational-memory summary.
- `off` — disable memory workers and memory compaction behavior.

OM does not schedule compaction. Pi/manual/eval compaction triggers still run; OM flushes memory at the compaction boundary and can replace the resulting context depending on strategy.

## Useful options

```json
{
  "observational-memory": {
    "strategy": "replacement",
    "observeEveryMessages": 32,
    "reflectEveryObservations": 8,
    "emergencyCurateWhenVisibleObservationsOver": 120,
    "protectRecentObservations": 32,
    "maxInitialObserveTokens": 100000,
    "observerThinking": "low",
    "reflectorThinking": "xhigh",
    "curatorThinking": "high",
    "debugLog": false
  }
}
```

`protectRecentObservations` keeps the newest active observations out of the curator drop candidate set. Older reviewed observations may be dropped when redundant, superseded, duplicate, routine, or otherwise low-value; pins and follow-up flags keep exact evidence visible when needed.

`maxInitialObserveTokens` prevents expensive backfill when the extension starts on an already-large session. It marks old history covered and observes future turns.

Context projection is decoupled from the observation token pool: incremental compaction materializes recorded reflections and currently visible observations, while full-fold compaction is reserved for deeper replay/drop reconciliation.

## Commands

- `/om:status` — show memory state. Use `/om:status full` for ledger/debug details.
- `/om:view` — show context/full/reviewed memory projection.

## Recall

Memory entries include 12-character ids. Use `recall(id)` when exact source context behind an observation or reflection is needed.

## Lifecycle

```text
source entries
  -> observer: source-backed evidence
  -> reflector: checkpoint facts backed by observations
  -> curator: pins, unpins, flags follow-up work, or tombstones reviewed evidence
  -> projection/rendering: reflections + unreviewed/pinned observations
```

Terms:

- Observation = source-backed evidence.
- Reflection = checkpoint fact backed by observations.
- Curator action = pin, unpin, follow-up flag, or drop reviewed evidence.

Safety rules:

- Never compact away unobserved source.
- Never drop an observation unless reflection review has covered it and the curator judges it safe to remove.
- No-tool worker response must not count as reviewed.
