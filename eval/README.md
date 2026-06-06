# Pi Memory/Compaction Evals

Evaluates whether Pi can answer fixed probes from compacted session context.

## Files

```text
suites/smoke/<id>/
  eval.yml                 # harness smoke/regression cases
  source.synthetic.jsonl   # committed replayable session
  source.jsonl             # optional private local session, gitignored

suites/compaction-sanity/<id>/
  eval.yml                         # small pre-compaction sanity cases
  source.precompact.synthetic.jsonl

suites/compaction-hard/<id>/
  eval.yml                         # harder answer-after-compaction extension comparison cases
  source.precompact.synthetic.jsonl

suites/recall-smoke/<id>/
  eval.yml                         # generic recall/tool-specific cases
  source.precompact.synthetic.jsonl

suites/session-memory-limits/<id>/
  eval.yml                         # extension-agnostic hard session memory after compaction cases
  source.precompact.synthetic.jsonl

suites/om-additive-hard/<id>/
  eval.yml                         # hard additive/replacement/default comparison cases for exact memory quality and cost
  source.precompact.synthetic.jsonl

suites/om-recall/<id>/
  eval.yml                         # OM id-based recall subsystem cases
  source.synthetic.jsonl

suites/om-observer/<id>/
  eval.yml                         # observer_probe rubric for generated OM observations
  source.precompact.synthetic.jsonl

suites/om-projection/<id>/
  eval.yml                         # projection_probe rubric for OM compaction projection
  source.synthetic.jsonl

suites/om-reflector/<id>/
  eval.yml                         # reflector_input + reflector_probe for generated reflections

suites/om-dropper/<id>/
  eval.yml                         # dropper_input + dropper_probe for dropped observation ids

suites/om-consolidation-hard/<id>/
  eval.yml                         # hard observer -> reflector -> dropper integrated subsystem cases

suites/om-consolidation-e2e/<id>/
  eval.yml                         # consolidation -> OM compaction -> final answer cases

suites/om-e2e-observed/<id>/
  eval.yml                         # materialized real OM observations, replayed through compaction/probe
  source.om-observed.synthetic.jsonl

suites/blackhole-e2e-observed/<id>/
  eval.yml                         # materialized blackhole observations, replayed through compaction/probe
  source.om-observed.synthetic.jsonl

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
npm run eval -- suites/smoke --dry-run --out /tmp/pi-eval-plan
```

Run eval:

```bash
npm run eval -- suites/smoke --out runs/baseline-001
```

Routine run:

```bash
npm run eval -- suites/smoke --out runs/baseline-001 --concurrency 2
```

Use `--calibrate` after changing rubrics, judge prompt, or judge model; it is a batched eval for the judge and costs extra model calls:

```bash
npm run eval -- suites/smoke --out runs/baseline-001 --calibrate --concurrency 2
```

Optional model override:

```bash
npm run eval -- suites/smoke --model openai-codex/gpt-5.4-mini --judge-model openai-codex/gpt-5.4-mini
```

Extension/compaction replay smoke:

```bash
npm run eval -- suites/smoke \
  --out runs/extension-smoke-001 \
  --extension /absolute/path/to/extension.ts \
  --compact-before-prompt \
  --compact-instructions "preserve decisions and constraints"
```

`--extension` may be repeated. Normal eval loads no discovered extensions. Extension eval loads only the explicit extension paths.

Recall/tool eval:

```bash
npm run eval -- suites/recall-smoke \
  --out runs/pi-vcc-recall-001 \
  --extension /absolute/path/to/pi-vcc \
  --allow-tool vcc_recall
```

`--allow-tool` may be repeated. Without it, eval runs with `noTools: all`.

Memory extensions that need preparatory turns before compaction can use:

```bash
npm run eval -- suites/compaction-hard \
  --out runs/memory-ext-001 \
  --extension /absolute/path/to/extension \
  --prepare-memory-before-compact \
  --memory-prepare-turns 6 \
  --memory-prepare-wait-ms 10000
```

Use `--cwd <dir>` when extension settings should come from a temporary project `.pi/settings.json`.

Session memory limits benchmark profiles:

```bash
npm run session-memory -- clean --out runs/session-memory-clean-001
npm run session-memory -- om --out runs/session-memory-om-001
npm run session-memory -- om-observed --out runs/session-memory-om-observed-001
npm run session-memory -- vcc --out runs/session-memory-vcc-001
npm run session-memory -- blackhole --out runs/session-memory-blackhole-001
npm run session-memory -- blackhole-observed --out runs/session-memory-blackhole-observed-001
```

Profiles encode approach-specific setup:

- `clean`: Pi default compaction.
- `om`: loads `/tmp/pi-observational-memory`, prepares OM before compaction, enables `recall`.
- `om-observed`: materializes OM memory first, then replays compact+answer with passive OM and `recall`.
- `vcc`: loads `/tmp/pi-vcc`, writes a temp `PI_VCC_CONFIG_PATH` with `overrideDefaultCompaction: true`, enables `vcc_recall`.
- `blackhole`: loads `/tmp/pi-blackhole`, temporarily writes/restores blackhole config with `compactionEngine: "blackhole"`, `memory: true`, low observe threshold, forced prep, enables `recall`.
- `blackhole-observed`: materializes blackhole memory first, then replays compact+answer with high observe threshold and `recall`. Use this for realistic cost split.

Manual equivalent for OM:

```bash
npm run eval -- suites/session-memory-limits \
  --out runs/session-memory-limits-om-001 \
  --cwd /tmp/pi-om-session-memory-cwd \
  --extension /absolute/path/to/pi-observational-memory \
  --prepare-memory-before-compact \
  --memory-prepare-turns 6 \
  --memory-prepare-wait-ms 10000 \
  --compact-before-prompt \
  --compact-instructions "Preserve exact current decisions, corrections, constraints, rejected stale options, and reasons. Prefer newer explicit corrections over older notes/reflections."
```

This is the main extension-agnostic benchmark for user-visible session memory after compaction. Run the same suite against clean Pi, OM, pi-vcc, and blackhole when comparing approaches.

Historical redacted suite:

```bash
npm run session-memory -- clean --suite suites/historical-redacted --out runs/historical-redacted-clean-001
npm run session-memory -- vcc --suite suites/historical-redacted --out runs/historical-redacted-vcc-001
npm run session-memory -- om-observed --suite suites/historical-redacted --out runs/historical-redacted-om-observed-001 --memory-prepare-turns 12 --memory-prepare-wait-ms 15000
npm run session-memory -- blackhole-observed --suite suites/historical-redacted --out runs/historical-redacted-blackhole-observed-001
```

`suites/historical-redacted` contains redacted/sliced real session fixtures only. Raw historical sessions and mined candidates remain private scratch under `scratch-historical/`.

For `pi-observational-memory`, materialize real observations once, then replay cheaply:

```bash
npm run materialize-om -- suites/compaction-hard \
  --out suites/om-e2e-observed \
  --extension /absolute/path/to/pi-observational-memory \
  --turns 6 \
  --wait-ms 10000 \
  --post-filler-turns 12

PI_OBSERVATIONAL_MEMORY_PASSIVE=1 npm run eval -- suites/om-e2e-observed \
  --out runs/hard-om-observed-001 \
  --extension /absolute/path/to/pi-observational-memory \
  --allow-tool recall \
  --concurrency 2
```

The materializer copies each fixture, runs OM preparation turns, fails if no `om.*` custom entries are written, and writes `source.om-observed.synthetic.jsonl` plus `materialize-om-manifest.json`.

OM recall subsystem eval:

```bash
npm run eval -- suites/om-recall \
  --out runs/om-recall-upstream-001 \
  --extension /absolute/path/to/pi-observational-memory \
  --allow-tool recall \
  --concurrency 2
```

This tests ID-based recall for observations, reflections through supporting observations, and dropped observations.

OM observer subsystem eval:

```bash
npm run om-observer -- suites/om-observer \
  --out runs/om-observer-upstream-001 \
  --extension /absolute/path/to/pi-observational-memory \
  --turns 6 \
  --wait-ms 10000
```

This runs OM observation preparation on raw synthetic sessions, extracts `om.observations.recorded`, and judges the generated observations directly.

OM projection subsystem eval:

```bash
npm run om-projection -- suites/om-projection \
  --out runs/om-projection-upstream-001 \
  --extension /absolute/path/to/pi-observational-memory
```

This compacts synthetic sessions with known/empty OM ledger state and judges the resulting compaction summary/details directly.

OM reflector subsystem eval:

```bash
npm run om-reflector -- suites/om-reflector \
  --out runs/om-reflector-upstream-001 \
  --extension /absolute/path/to/pi-observational-memory
```

This imports upstream `runReflector`, feeds known observations, and judges generated reflections directly. Current token summary only includes judge usage, not reflector model usage.

OM dropper subsystem eval:

```bash
npm run om-dropper -- suites/om-dropper \
  --out runs/om-dropper-upstream-001 \
  --extension /absolute/path/to/pi-observational-memory
```

This imports upstream `runDropper`, feeds known observations/reflections/token target, and judges selected dropped ids directly. Current token summary only includes judge usage, not dropper model usage.

OM integrated consolidation hard eval:

```bash
npm run om-consolidation -- suites/om-consolidation-hard \
  --out runs/om-consolidation-upstream-001 \
  --extension /absolute/path/to/pi-observational-memory
```

This imports upstream observer, reflector, and dropper agents, runs them in sequence, captures stage-level background model usage from agent-loop messages, and judges the resulting observations/reflections/dropped ids. Summary usage includes `observer`, `reflector`, `dropper`, `om`, `judge`, and `total`.

OM consolidation e2e answer eval:

```bash
npm run om-consolidation-e2e -- suites/om-consolidation-e2e \
  --out runs/om-consolidation-e2e-upstream-001 \
  --extension /absolute/path/to/pi-observational-memory
```

This runs upstream consolidation, writes OM custom entries into a temporary session, triggers OM compaction, asks Pi the probe, and judges the final answer. Summary usage includes `om`, `answer`, `judge`, and `total`.

## Outputs

```text
calibration.json      # only with --calibrate
results.json          # raw probe answers + answer token usage
judged-results.json   # answers + judge verdicts + judge token usage
summary.json          # pass/fail summary, token totals, per-case breakdown
```

`summary.json` is the first file to inspect. It separates answer, compaction, and judge usage. Default Pi compaction usage is included in total token counts when pre-prompt compaction runs. Extension-provided compaction usage is only included if it flows through the Pi model stream.

The runner uses the Pi SDK with:

```text
model: openai-codex/gpt-5.4-mini
thinking: off
tools/extensions/skills/prompts/themes/context-files: disabled
```

Semantic judge is authoritative. No phrase-search pass/fail checks.

## Scope

Current runner supports baseline answer quality, pre-compaction fixture replay, explicit extension replay, recall/tool evals, and OM observer subsystem evals. Easy suites are harness smoke; `suites/compaction-hard` is for extension comparison.
