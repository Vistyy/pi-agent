---
name: spike
description: Use when a consequential feasibility, integration, or performance hypothesis can be resolved by a bounded real-system experiment.
---

# Spike

A spike is a bounded experiment that replaces a consequential technical assumption with evidence.

## 1. Frame the hypothesis

State one decision-driving falsifiable technical hypothesis.
Define the evidence that would support, refute, or leave it inconclusive.
Define a baseline when comparison with current behavior or performance affects the decision.
Identify run conditions or variability only when they can change the conclusion.

This step is complete when the hypothesis, decision criteria, and applicable baseline are explicit.

## 2. Establish approval and scope

Describe the experiment, its boundary, and any repository changes, external effects, material risk, or cost.
Treat an explicit user request for an experiment as approval only for its requested boundary and explicitly named effects.
Obtain separate approval before adding an unmentioned repository mutation, external effect, material cost, or material risk.
An agent-proposed read-only local probe may proceed when the current authorized outcome requires its evidence, repository instructions permit it, and it has no material cost, risk, or external effect.
Otherwise, obtain approval before modifying files, changing external state, incurring material cost, or introducing material risk for an agent-proposed spike.
Obtain approval before materially expanding an approved experiment's scope, risk, cost, or external effects.
If required approval is declined or unavailable, do not run the spike.

This step is complete when the experiment is either authorized within an explicit boundary or declined.

## 3. Run the experiment

Use the narrowest experiment that exercises the relevant real system and can distinguish the defined outcomes.
Capture the defined baseline when one applies.
Limit changes to the uncertain path and the setup, instrumentation, and teardown required to evaluate it.
Before changing state, distinguish pre-existing state and record the files and external state the spike will own.
Run the experiment and collect enough observations to apply the decision criteria.
Record material run conditions, variability, and failures when they affect interpretation.

The spike may omit production hardening, reusable abstractions, and unrelated coverage.
It must retain the work required for safe execution and reliable interpretation of the evidence.

This step is complete when the evidence supports the hypothesis, refutes it, or establishes why the result is inconclusive.

## 4. Record the result

Record the applicable information concisely:

- the hypothesis and applicable baseline;
- the experiment, relevant commands, changed conditions, and scope;
- the evidence and material run conditions;
- the supported, refuted, or inconclusive conclusion;
- the effect on the decision;
- material limitations and unresolved evidence gaps.

This step is complete when the decision-maker can understand what was tested, what the evidence shows, and how it affects the decision.

## 5. Resolve spike-owned state

On completion, failure, or interruption, remove spike-owned repository and external state unless its production implementation is separately authorized.
Preserve pre-existing and unrelated state.
Do not promote prototype code into production only by cleaning it up.
When production implementation is authorized, implement it through the repository's normal development process.
Verify cleanup with targeted diff and status inspection and with the applicable external-state check.
When state cannot be restored or verified, report the remaining state, impact, responsible owner, and required action.

This workflow is complete when the authorized production implementation remains or no spike-owned state remains, and every unresolved external effect has a responsible owner and explicit action.
