# Pi Memory/Compaction Evals

Evaluates whether Pi can answer fixed probes from compacted session context.

## Files

```text
eval/fixtures/<id>/
  source.synthetic.jsonl   # committed replayable session
  source.jsonl             # optional private local session, gitignored
  probes.yml               # questions + answer checks
  expected.yml             # human-readable expected facts
  fixture.yml              # metadata

eval/runs/                 # generated results, gitignored
eval/scratch-historical/   # private calibration sessions, gitignored
```

## Run

Dry run, no model calls:

```bash
node eval/scripts/run-agent-probes.mjs eval/fixtures --out /tmp/pi-eval-plan
```

Execute probes using default model `openai-codex/gpt-5.4-mini`:

```bash
node eval/scripts/run-agent-probes.mjs eval/fixtures \
  --execute \
  --out eval/runs/baseline-gpt-5-4-mini-001
```

Override model if needed:

```bash
node eval/scripts/run-agent-probes.mjs eval/fixtures --execute --model openai-codex/gpt-5.4-mini
```

The runner copies each fixture session to `/tmp`, runs:

```text
pi --print --session <copy> --no-tools --no-extensions --thinking off
```

Then scores the final answer with `must_contain` / `must_not_contain` from `probes.yml`.

## Scope

Current runner tests baseline answer quality from existing compacted session context. Extension replay/comparison comes later.
