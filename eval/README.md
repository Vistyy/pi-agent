# Behavioral evaluation harness

This directory contains the local Pi behavioral evaluation harness.
Behavior and case manifests describe what the configured agent must do.
Runtime bindings describe how a case is executed and observed.
Configured systems select exact models, thinking levels, resources, and tools.

## Current boundary

The walking skeleton supports closed-schema catalog validation, scripted read-only Pi sessions, transcript capture, tool-trajectory capture, sequential trials, cleanup, and local JSON artifacts.
It deliberately records behavioral results as `unknown` with `pending_human` grading.
A run from this version cannot establish that a behavior passes or fails.

Automatic semantic grading, grader calibration, adaptive interactions, state-changing cases, treatment comparison, parallel execution, and historical-result promotion remain outside the walking skeleton.

## Commands

Run commands from this directory.

```bash
pnpm eval validate
pnpm test
pnpm typecheck
pnpm eval run \
  --case choose-reconnection-state-owner \
  --system luna-medium \
  --trials 1
```

`luna-medium` is the lower-cost smoke configuration.
`sol-medium` represents the current general-work configuration and should be used for primary behavioral evidence after grading is calibrated.
A smoke result from one model must not be generalized to another model.

Raw run artifacts are written under `runs/` and are ignored by Git.
They preserve evidence for inspection but are not accepted historical results.

## Authoring boundaries

A behavior manifest owns the accepted behavior, applicability, and important failure modes.
A case manifest owns the scenario, concrete interaction, required observations, and case-specific criteria.
A runtime binding owns the fixture, preflight checks, collectors, and grader implementation references.
A configured-system manifest owns the model, thinking level, resources, and tools.

The catalog validator rejects execution configuration in case manifests and requires every declared initial condition, observation, and criterion to have one runtime implementation.

## Adding an ordinary case

Add a case directory containing `case.yaml`, `runtime.yaml`, and fixture data.
Reuse `scripted-pi-project`, `pi-message-collector`, `pi-tool-trajectory-collector`, and `semantic-criterion` when their behavior is sufficient.
No runner change is required for another case using those existing execution capabilities.

A genuinely new interaction, evidence, fixture, or grading capability requires a reusable adapter and ordinary tests.

## Historical results

Raw runs are never committed or promoted automatically.
`results/history.jsonl` retains reviewed checkpoints rather than every accepted run.
A checkpoint records a first model qualification, a pass or failure transition, a material reliability change, a conclusion-changing suite or grader revision, or an explicit product decision.
Repeated runs that preserve the same accepted conclusion do not create another historical record.
Each checkpoint must identify the behavior, cases, exact model and thinking level, trial distribution, grader revision, repository revision, and reason for retention.
The same behavior retains separate checkpoints for separate configured models.
A current model-by-behavior view may later be generated from the latest applicable checkpoints.
