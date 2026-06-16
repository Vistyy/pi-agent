# Pi evals

Evaluation harnesses for memory, observational-memory agents, and pi-fork behavior.

## Layout

```text
src/cli/                 executable wrappers; these are the only files that call main()
src/lib/                 shared suite runner, judge, Pi SDK helpers, fixtures, summaries
src/om/                  observational-memory agent evals
  agent-evals.ts         OM agent eval CLI implementation
  cases/                 observer, reflector, rewrite, recall, e2e cases
  diagnostics.ts         judge/deterministic diagnostics
  runner.ts              model loading, OM agent loading, usage helpers
src/fork/                pi-fork evals
  agent-evals.ts         fork tool-selection eval CLI implementation
  prompt-evals.ts        fork child-prompt eval CLI implementation
  cases/                 fork agent and prompt cases
  runner.ts/tool.ts      fork mock tool, diagnostics, runner helpers
suites/                  YAML/session fixture suites for the generic memory runner
runs/                    generated outputs; do not commit
```

## Suite layout

```text
suites/memory/
  discriminator/         focused current-vs-stale and exact-evidence discriminators
  multi-compact/         retained hard memory/compaction cases
```

Each leaf case directory contains:

```text
eval.yml
source.stage1.jsonl
source.stage2.jsonl
...
```

The suite runner accepts either one leaf fixture or any parent directory. Parent directories are scanned recursively for `eval.yml` files.

Examples:

```bash
pnpm eval -- suites/memory/multi-compact --dry-run --out /tmp/pi-memory-plan
pnpm eval -- suites/memory/discriminator --dry-run --out /tmp/pi-memory-discriminator-plan
pnpm eval -- suites/memory --dry-run --out /tmp/pi-memory-all-plan
```

Default `pnpm eval` target:

```text
suites/memory/multi-compact
```

## Package scripts

```bash
pnpm eval                  # generic YAML/session suite runner
pnpm session-memory        # compare clean / OM replacement / original extension on a suite
pnpm om-agent-evals        # direct OM observer/reflector/rewrite/recall/e2e agent evals
pnpm fork-agent-evals      # direct fork tool-selection evals
pnpm fork-prompt-evals     # fork child prompt evals
pnpm mine-historical       # mine candidate probes from a historical session
pnpm typecheck
```

Use `pnpm`, not `npm`.

## Common runs

Generic memory suite:

```bash
pnpm eval -- suites/memory/multi-compact --out runs/memory-multi-compact-clean
```

Session memory variant comparison:

```bash
pnpm session-memory -- clean --out runs/memory-clean-001
pnpm session-memory -- om-replacement --out runs/memory-om-replacement-001 \
  --om-extension /home/syzom/.pi/agent/extensions/pi-observational-memory
```

OM agent evals:

```bash
pnpm om-agent-evals --only reflectorRealSessionConstraintsAndState --thinking low \
  --model openai-codex/gpt-5.4-mini \
  --judge-model openai-codex/gpt-5.4-mini \
  --out runs/reflector-real-session-constraints-mini-low
```

Fork evals:

```bash
pnpm fork-agent-evals --case memory-child-extensions-no-fork --out runs/fork-agent-smoke
pnpm fork-prompt-evals --case fast-command-lookup --out runs/fork-prompt-smoke
```

## Result files

Suite/session runs write some or all of:

```text
runs/<name>/summary.json
runs/<name>/results.json
runs/<name>/judged-results.json
runs/<name>/results.partial.json
```

Agent eval summaries include timing, usage, and scored-capability fields where available:

```text
durationMs
agentDurationMs
judgeDurationMs
diagnosisDurationMs
usage
judgeUsage
diagnosisUsage
score
maxScore
byAgent
perCase
```

For scored OM agent evals, `passed` means hard safety/invariant checks passed. The score measures retained useful detail, provenance, and completeness. A score miss is not automatically an unsafe failure.

## Notes

- Eval output directories under `runs/` are not meant to be committed.
- `clean` loads no extension.
- `om-replacement` loads the current observational-memory extension in replacement mode.
- `original` is for a local checkout of `https://github.com/elpapi42/pi-observational-memory`.
- Additive OM mode and dropper-specific eval paths are obsolete.
- Direct OM/fork agent eval cases live in TypeScript under `src/om/cases` and `src/fork/cases`; generic memory replay fixtures live under `suites/`.
