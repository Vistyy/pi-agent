# Eval Design Guidance for Pi Memory/Compaction Work

Status: working guidance for designing reliable, low-cost evals before testing extensions.

## External guidance distilled
OpenAI eval guidance emphasizes:

```text
define objective
collect representative data
define metrics
run/compare repeatedly
continuously add cases from logs
```

Useful principles:

- Eval-driven development: write tests before changing prompts/extensions.
- Task-specific evals: test the behavior we actually care about, not generic scores.
- Mix data sources: synthetic edge cases + historical logs + human-curated cases.
- Automate when possible, but calibrate against human judgment.
- For agents, evaluate tool selection, tool arguments, final answer correctness, and full trace behavior.
- LLM judges are useful for open-ended answers, but should be calibrated and not be the only signal.
- Prefer classification/comparison/rubric checks over vague open-ended judging.

## Our eval ladder

```text
answer correctness
  -> given a compacted/reconstructed session, can the agent answer probes correctly?

trace/tool behavior
  -> did agent use recall/fork/tool when it should?

end-to-end replay
  -> run Pi with extension and compare outputs/cost/latency
```

Artifact-only checks are not the main eval. They can help debug why an answer failed, but they do not prove agent behavior.

## Fixture policy

```text
synthetic fixtures
  -> committed, replayable, controlled failure cases

historical fixtures
  -> scratch/local, gitignored, used to discover real cases and calibrate probes

redacted historical fixtures
  -> optional later, committed only after minimization/redaction
```

## Reliable fixture design
Each fixture should have one clear failure mode.

Good fixture:

```text
one scenario
one compaction point
few expected facts
focused probes
clear pass/fail
```

Bad fixture:

```text
whole messy session
many unrelated decisions
ambiguous expected answer
no specific failure mode
```

## Target failure modes

```text
tentative_vs_decided
  tentative idea later rejected must not become chosen direction

rejected_path_resurrection
  rejected approach must remain rejected after compaction

subtle_constraint_once
  one important user constraint must survive compaction

exact_evidence_needed
  summary should not pretend exact evidence exists; recall/evidence layer needed

branch_future_contamination
  forked/earlier branch must not include future decisions

summary_drift
  repeated compaction must not reverse or drop load-bearing decisions

tool_noise_burial
  important conclusion buried among noisy tool outputs must survive
```

## Metrics by layer

### Answer correctness
Use the Pi agent with a fixture session and fixed probe, then deterministic + judge checks:

```text
must state current decision
must mention rejected path
must not treat rejected path as selected
must distinguish evidence vs summary
```

### Trace/tool behavior
For VCC/recall/fork later:

```text
must call recall when exact old evidence is requested
must not call recall for broad unrelated search
must call fork for noisy investigation task if configured
must not expose child tool noise in main final answer
```

### Cost/latency
Record:

```text
input/output tokens
cache read/write if available
compaction latency
background worker calls
context chars/tokens after compaction
```

## Cost control

- Keep synthetic fixtures small.
- Prefer dry-run prompt/command inspection before model-answer checks.
- Use cheap model for answer checks unless judging subtle semantic correctness.
- Batch only after fixture quality is stable.
- Do not use full historical sessions in repeated model evals unless minimized.

## Next step
Build 4-6 synthetic committed fixtures, then optionally convert one historical session into a minimized redacted fixture.
