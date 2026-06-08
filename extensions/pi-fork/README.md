# pi-fork

Adds a `fork` tool for running focused work in a child Pi process.

A fork starts from a temporary snapshot of the current active session branch, runs the requested task, and returns a structured report. Use it for noisy investigation, review, debugging, validation, or option analysis that would clutter the main conversation.

## Tool

```json
{
  "task": "Inspect the eval harness and report where fork evals should go.",
  "effort": "balanced"
}
```

`effort` is optional: `fast`, `balanced`, or `deep`.

## Child extensions

Fork children load no extensions by default.

```json
{
  "pi-fork": {
    "extensions": []
  }
}
```

`extensions` is tri-state:

| value | behavior |
| --- | --- |
| omitted | no child extensions |
| `[]` | no child extensions |
| `null` | normal Pi extension discovery |
| `["<source>"]` | only listed extension sources |

If `pi-fork` is allowlisted, children can call `fork` recursively.

## Config

Config goes under `pi-fork` in `~/.pi/agent/settings.json` or `.pi/settings.json`.

```json
{
  "pi-fork": {
    "offline": true,
    "costFooter": true,
    "environment": {
      "MY_MODE": "fork"
    },
    "defaultEffort": "balanced",
    "effortProfiles": {
      "fast": {
        "provider": "openai-codex",
        "id": "gpt-5-mini",
        "thinking": "minimal"
      },
      "balanced": {
        "provider": "openai-codex",
        "id": "gpt-5.5",
        "thinking": "medium"
      },
      "deep": {
        "provider": "openai-codex",
        "id": "gpt-5.5",
        "thinking": "high"
      }
    }
  }
}
```

Defaults:

```text
extensions: []
offline: true
costFooter: true
environment: {}
```

`offline: true` sets `PI_OFFLINE=1` for children. Set `offline: false` when child extension sources need network install behavior.

`costFooter: true` shows aggregate fork cost in the footer, for example:

```text
forks +$0.123
```

## Good use cases

- broad code search
- independent review
- debugging traces
- validation runs
- architecture or option comparison
- docs/source inspection

Avoid forks for trivial edits, single-file reads, or questions the current agent can answer directly.
