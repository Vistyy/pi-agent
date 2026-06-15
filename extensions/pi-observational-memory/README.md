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

OM does not schedule compaction. Pi/manual/eval compaction triggers still run; OM renders deterministic memory at the compaction boundary and can replace the resulting context depending on strategy.

## Useful options

```json
{
  "observational-memory": {
    "strategy": "replacement",
    "observeEveryMessages": 32,
    "reflectEveryObservations": 8,
    "maxInitialObserveTokens": 100000,
    "observerThinking": "low",
    "reflectorThinking": "low",
    "debugLog": false
  }
}
```

`maxInitialObserveTokens` prevents expensive backfill when the extension starts on an already-large session. It marks old history covered and observes future turns.

Active context projection renders current reflections only. Observations remain durable ledger evidence for reflector input and recall.

## Commands

- `/om:status` — show memory state. Use `/om:status full` for ledger/debug details.
- `/om:view` — show context/full/reviewed memory projection.

## Recall

Memory entries include ids such as `obs_...` and `ref_...`. Use `recall(id)` when exact source context behind an observation or reflection is needed.

## Lifecycle

```text
source entries
  -> observer: source-backed durable observations
  -> reflector: active facts backed by typed source ids
  -> projection/rendering: current active reflections
  -> recall: exact evidence recovery from reflections, observations, and source entries
```

Terms:

- Observation = source-backed durable evidence.
- Reflection = active memory backed by typed source ids.
- Active memory = current reflections only.

Safety rules:

- Never compact away unobserved source.
- Observations remain recallable even when hidden from active memory.
- No-tool worker response must not count as reviewed.
