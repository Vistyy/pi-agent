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

## Useful options

```json
{
  "observational-memory": {
    "strategy": "additive",
    "observeAfterTokens": 10000,
    "reflectAfterTokens": 20000,
    "compactAfterTokens": 81000,
    "maxInitialObserveTokens": 100000,
    "additivePatchMaxTokens": 2000,
    "debugLog": false
  }
}
```

`maxInitialObserveTokens` prevents expensive backfill when the extension starts on an already-large session. It marks old history covered and observes future turns.

## Commands

- `/om:status` — show memory state.
- `/om:view` — show visible/full memory projection.

## Recall

Memory entries include 12-character ids. Use `recall(id)` when exact source context behind an observation or reflection is needed.
