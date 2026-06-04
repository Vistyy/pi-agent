# Baseline Memory / Compaction Eval

Status: baseline answer-probe harness exists. Next: run full baseline suite, then design extension replay/comparison.

## Goal
Measure whether Pi can answer fixed probes from compacted session context before testing memory/context extensions.

Baseline questions:

```text
Can the agent preserve decisions after compaction?
Can it avoid resurrecting rejected paths?
Can it preserve one-off constraints?
Can it admit insufficient context when exact evidence is absent?
```

## Current harness

```text
eval/scripts/run-agent-probes.mjs
```

Behavior:

```text
fixture session JSONL
  -> copy to /tmp
  -> pi --print --session <copy>
  -> ask fixed probe
  -> score answer with probes.yml checks
```

Default runtime:

```text
model: openai-codex/gpt-5.4-mini
thinking: off
tools/extensions/skills/context-files: disabled
```

Dry run:

```bash
node eval/scripts/run-agent-probes.mjs eval/fixtures --out /tmp/pi-eval-plan
```

Execute:

```bash
node eval/scripts/run-agent-probes.mjs eval/fixtures \
  --execute \
  --out eval/runs/baseline-gpt-5-4-mini-full-001
```

## Fixture policy

```text
tracked:
  eval/fixtures/**
  eval/scripts/**
  eval/README.md

ignored:
  eval/runs/**
  eval/scratch-historical/**
  eval/fixtures/**/source.jsonl
```

Synthetic replayable sessions use:

```text
source.synthetic.jsonl
```

Historical/private sessions are only scratch calibration unless later redacted/minimized.

## Current synthetic fixtures

```text
tentative-vs-decided
  -> tentative JSON/state-machine idea later rejected

rejected-path-resurrection
  -> append-only canonical memory explicitly rejected

subtle-constraint-once
  -> cost-control constraint mentioned once must survive

exact-evidence-needed
  -> exact old assertion absent after compaction; answer should be INSUFFICIENT_CONTEXT
```

## Current results
Smoke runs with `openai-codex/gpt-5.4-mini` passed after tuning prompts/checks.

Important lesson:

```text
exact phrase checks were too brittle
negative checks can false-trigger on negated statements
answer prompt must ask for key details/caveats, not just terse answers
```

## Next steps

```text
1. Run full 4-fixture baseline suite once.
2. Commit eval scaffold and fixtures.
3. Design extension replay/comparison harness.
4. Only then inspect/test pi-blackhole or other extensions.
```

Extension replay needs more thought because it must evaluate actual agent behavior with extension-produced compaction/memory, not artifact text alone.
