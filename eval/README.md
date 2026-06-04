# Pi Memory/Compaction Evals

Evaluates whether Pi can answer fixed probes from compacted session context.

## Files

```text
fixtures/<id>/
  eval.yml                 # metadata, probe rubric, judge calibration
  source.synthetic.jsonl   # committed replayable session
  source.jsonl             # optional private local session, gitignored

runs/                      # generated results, gitignored
scratch-historical/        # private calibration sessions, gitignored
```

## Run

Install once:

```bash
cd ~/.pi/agent/eval
npm install
```

Dry run, no model calls:

```bash
npm run eval -- fixtures --dry-run --out /tmp/pi-eval-plan
```

Run eval:

```bash
npm run eval -- fixtures --out runs/baseline-001
```

Routine run:

```bash
npm run eval -- fixtures --out runs/baseline-001 --concurrency 2
```

Use `--calibrate` after changing rubrics, judge prompt, or judge model; it is a batched eval for the judge and costs extra model calls:

```bash
npm run eval -- fixtures --out runs/baseline-001 --calibrate --concurrency 2
```

Optional model override:

```bash
npm run eval -- fixtures --model openai-codex/gpt-5.4-mini --judge-model openai-codex/gpt-5.4-mini
```

Extension/compaction replay smoke:

```bash
npm run eval -- fixtures \
  --out runs/extension-smoke-001 \
  --extension /absolute/path/to/extension.ts \
  --compact-before-prompt \
  --compact-instructions "preserve decisions and constraints"
```

`--extension` may be repeated. Normal eval loads no discovered extensions. Extension eval loads only the explicit extension paths.

## Outputs

```text
calibration.json      # only with --calibrate
results.json          # raw probe answers + answer token usage
judged-results.json   # answers + judge verdicts + judge token usage
summary.json          # pass/fail summary, token totals, per-case breakdown
```

`summary.json` is the first file to inspect.

The runner uses the Pi SDK with:

```text
model: openai-codex/gpt-5.4-mini
thinking: off
tools/extensions/skills/prompts/themes/context-files: disabled
```

Semantic judge is authoritative. No phrase-search pass/fail checks.

## Scope

Current runner supports baseline answer quality and explicit extension replay with optional manual compaction before probes. Comparison/reporting between baseline and extension runs comes later.
