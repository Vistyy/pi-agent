---
name: spike
description: Use when designing a real-system experiment to resolve a technical unknown that could change the decision. Skip source explanations and executing experiments whose hypothesis, criteria, scope, and safeguards are already supplied.
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
Determine whether the current request or accepted plan already authorizes the experiment and its effects.
An approved implementation can cover bounded local experiments needed to deliver and verify it; do not require separate permission merely because that work is called a spike.
A read-only investigation does not by itself authorize repository changes or external effects.
Obtain approval when the experiment is outside existing authority or materially expands scope, risk, cost, or external effects.
If required approval is declined or unavailable, do not run the spike.
Identify disposable setup and any prototype or evidence artifacts the user requested to retain.

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

On completion, failure, or interruption, remove disposable spike-owned setup and restore temporary external state.
Preserve pre-existing state, unrelated changes, and prototype or evidence artifacts whose retention is authorized.
Retaining an experimental artifact does not make it a maintained product implementation.
Promote it only when product implementation is authorized and it meets the repository's normal development and verification requirements.
Verify cleanup with targeted diff and status inspection and with the applicable external-state check.
When state cannot be restored or verified, report the remaining state, impact, responsible owner, and required action.

This workflow is complete when only authorized artifacts remain and every unresolved external effect has a responsible owner and explicit action.
