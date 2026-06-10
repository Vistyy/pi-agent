# Pi memory evals

Small benchmark for comparing Pi default compaction against observational-memory variants.

## Active suite

```text
suites/memory-multi-compact/      10 hardest retained cases
runs/                    generated results, gitignored
scratch-historical/      private scratch, gitignored
```

`memory-hard` keeps the historically hardest user-visible memory failures:

```text
ambiguous-similar-errors
assistant-only-evidence
buried-negative-constraint
conflicting-current-decision
long-noisy-100-turn
multi-hop-artifact-path
rejected-command-resurrection
temporal-expiry-current-rule
tool-result-only-evidence
unresolved-conflict-with-prior-final
```

## Run

Install once:

```bash
cd ~/.pi/agent/eval
npm install
```

Dry run:

```bash
npm run eval -- suites/memory-multi-compact --dry-run --out /tmp/pi-memory-hard-plan
```

Default Pi:

```bash
npm run session-memory -- clean --out runs/memory-hard-clean-001
```

Latest OM additive:

```bash
npm run session-memory -- om-additive --out runs/memory-hard-om-additive-001 \
  --om-extension /home/syzom/.pi/agent/extensions/pi-observational-memory
```

Latest OM replacement:

```bash
npm run session-memory -- om-replacement --out runs/memory-hard-om-replacement-001 \
  --om-extension /home/syzom/.pi/agent/extensions/pi-observational-memory
```

Original `elpapi42/pi-observational-memory` checkout:

```bash
npm run session-memory -- original --out runs/memory-hard-original-001 \
  --original-extension /path/to/elpapi42/pi-observational-memory
```

Useful options:

```text
--model provider/model
--concurrency N
--suite suites/memory-multi-compact
--cwd /tmp/custom-pi-cwd
```

OM variants rely on the compaction boundary to run due memory consolidation inline for preloaded fixtures.

Forced materialization mode, for debugging only:

```bash
npm run session-memory -- om-additive --out runs/memory-hard-om-additive-forced-001 \
  --forced-memory-prep --memory-prepare-turns 1
```

## Result files

Each run writes:

```text
runs/<name>/summary.json
runs/<name>/results.json
runs/<name>/judged-results.json
```

`summary.json` reports quality and cost:

```text
passed / total
usage.prep        # memory prep calls
usage.compaction  # compaction call
usage.answer      # final answer call
usage.judge       # judge calls
usage.total
```

Use pass rate plus `usage.total.totalTokens` for cost/performance.

## Failure modes

The active memory suite targets compacted-session failure patterns:

```text
tentative_vs_decided
  tentative idea later rejected must not become chosen direction

rejected_path_resurrection
  rejected approach must remain rejected after compaction

subtle_constraint_once
  one important user constraint must survive compaction

exact_evidence_needed
  answer should admit when exact evidence is absent and recall/source context is needed

summary_drift
  repeated compaction must not reverse or drop load-bearing decisions

tool_noise_burial
  important conclusion buried among noisy tool outputs must survive
```

## Notes

- `clean` loads no extensions.
- `om-additive` sets `observational-memory.strategy = "additive"` in a temp cwd.
- `om-replacement` sets `observational-memory.strategy = "replacement"` in a temp cwd.
- Normal runs use accelerated eval threshold `observeAfterTokens = 1000` so preloaded fixtures trigger OM.
- OM variants do not add synthetic prep turns by default.
- `--forced-memory-prep` adds synthetic prep turns and is not representative of normal usage cost.
- `original` is for a local checkout of `https://github.com/elpapi42/pi-observational-memory`.
- pi-vcc and pi-blackhole profiles were removed from active evals.
