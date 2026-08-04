---
name: spike
description: Spike a consequential feasibility, integration, or performance hypothesis when a bounded real-system experiment can replace guessing with evidence.
---

# Spike

A spike is a bounded experiment that replaces a consequential technical assumption with evidence.

## 1. Frame the hypothesis

State one falsifiable technical hypothesis.
Define the evidence that would support, refute, or leave the hypothesis inconclusive.
Define the baseline when the hypothesis concerns current behavior or performance.

This step is complete when the hypothesis, evidence, and required baseline are explicit.

## 2. Request approval

Explain why a spike is appropriate.
Describe the intended experiment and its expected scope.
If the user explicitly requested a spike, treat that request as approval.
If the model identified the opportunity, ask the user to approve the spike before modifying files or running spike commands.

This step is complete when the user approves or declines the spike.

## 3. Run the experiment

Use the smallest experiment that exercises the real system relevant to the hypothesis.
Capture the defined baseline.
Limit changes to the uncertain path.
Track each change created for the spike.
Run the experiment and collect the defined evidence.
The spike may omit production cleanup, reusable abstractions, comprehensive tests, and unrelated edge cases.

This step is complete when the evidence supports the hypothesis, refutes the hypothesis, or shows why the spike is inconclusive.

## 4. Record the result

Record the result under these fixed headings in order:

1. `Hypothesis`: State the falsifiable technical hypothesis.
2. `Baseline`: Record the defined baseline and measurement method when applicable.
3. `Experiment`: Record the real-system procedure, commands, changed variable, and scope.
4. `Evidence`: Record the observations and artifacts needed to interpret the result.
5. `Conclusion`: Classify the result as supported, refuted, or inconclusive.
6. `Effect on plan`: State how the result changes the current plan.
7. `Limitations`: Record untested conditions, unresolved evidence gaps, and scope limits.

This step is complete when another agent can understand what was tested and why the result affects the plan.

## 5. Resolve the spike code

Remove only the throwaway changes created for the spike.
If the validated approach will become production code, implement it through the repository's normal development process.

This step is complete when the workspace contains either the clean production implementation or no spike-only code.
