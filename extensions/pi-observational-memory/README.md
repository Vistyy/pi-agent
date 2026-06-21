# pi-observational-memory

Pi extension for session-local observational memory.

It records durable observations as ledger evidence and current reflections as active memory.
It preserves exact details like commands, paths, errors, decisions, and run results, then exposes current reflections after compaction.

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

- `replacement` - default. Replace Pi compaction with an observational-memory summary.
- `off` - disable memory workers and memory compaction behavior.

OM does not schedule compaction. Pi/manual/eval compaction triggers still run; OM renders deterministic memory at the compaction boundary and can replace the resulting context depending on strategy.

## Useful options

```json
{
  "observational-memory": {
    "strategy": "replacement",
    "observeEveryMessages": 32,
    "reflectEveryObservations": 8,
    "reflectionsPoolMaxTokens": 8000,
    "maxInitialObserveTokens": 100000,
    "observerThinking": "low",
    "reflectorThinking": "low",
    "rewriteThinking": "low",
    "debugLog": false
  }
}
```

`maxInitialObserveTokens` prevents expensive backfill when the extension starts on an already-large session. It marks old history covered and observes future turns.

Active memory renders current reflections only. Observations remain durable ledger evidence for reflector input and recall.

## Commands

- `/om:status` - show memory state. Use `/om:status full` for ledger/debug details.
- `/om:view` - show context memory. Use `/om:view recorded` for recorded observations and reflections.

## Recall

Memory entries include ids such as `obs_...` and `ref_...`.
Use `recall({ id, mode?, depth? })` when exact source context behind an observation or reflection is needed.
Use `mode: "provenance"` when intermediate reflection contents are needed; default evidence mode shows provenance ids, terminal observations, and source entries.

## Lifecycle

```text
source entries
  -> observer: source-backed durable observations
  -> reflector: active facts backed by typed source ids
  -> active memory rendering: current active reflections
  -> maintainer: local active-reflection cleanup
  -> emergency rewrite: rare over-budget fallback
  -> recall: exact evidence recovery from reflections, observations, retired reflections, and source entries
```

Terms:

- Observation = source-backed durable evidence.
- Reflection = active memory backed by typed source ids.
- Active memory = current reflections only.

Safety rules:

- Never compact away unobserved source.
- Observations remain recallable even when hidden from active memory.
- Retired reflections remain recallable by exact id.
- No-tool worker response must not count as covered.
