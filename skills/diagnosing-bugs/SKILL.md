---
name: diagnosing-bugs
description: Use when a failure's cause is unknown, reproduction is unreliable, or evidence spans multiple systems.
---

# Diagnosing Bugs

Prefer controlled experiments when they can distinguish a cause from a plausible correlation.
Read the applicable context and accepted decisions that govern the failure.
Use `CONTEXT-MAP.md`, when present, to locate likely affected contexts, and expand the set only when evidence requires it.

**Diagnostic loop**: A repeatable command or procedure that produces evidence of the reported symptom.

## 1. Establish the diagnostic loop

Record the expected behavior, observed behavior, environment, and user-visible symptom.
Select the closest practical observation point, such as a seam, workload, trace, or manual procedure.
Create the shortest diagnostic loop that preserves evidence of the symptom.
When a fix is planned and the original user-level reproduction is available, retain it for final verification.

Automate repeated setup, execution, observation, and cleanup when practical.
When a manual action remains, record the action and why automation is impractical.

For a quantitative intermittent comparison, state and justify the sampling count and decision threshold from the observed rate, the material distinction, and the resource bound.
When those facts are unavailable, expose what must be decided instead of inventing values.
Record the reason for any later change.
For a performance comparison, hold the workload and measurement method constant across compared experiments.
Change them only when testing representativeness, and record the change.

Run the diagnostic loop and record its command or procedure, relevant workload or measurement method, baseline observation, and output.
When reproduction is unavailable but existing logs, traces, artifacts, or static evidence can distinguish explanations, continue and state the limitation.
When neither reproduction nor useful existing evidence is available, report the attempted methods, missing evidence, and stopping reason, then request what is required to continue.

This step is complete when the diagnostic loop has a recorded baseline, available existing evidence can evaluate an experiment, or the evidence required to continue is explicit.

## 2. Run discriminating experiments

Inspect relevant errors, logs, traces, runtime state, and recent changes.
Verify that a repository command or diagnostic tool exists before using it.

Before each experiment, state the hypothesis, the observation that would distinguish it, and the variables that will change.
After the experiment, record the observation and classify the conclusion as supported, rejected, or inconclusive.
Name competing explanations when they materially affect what the experiment can distinguish.
Use an inconclusive result to refine the next experiment instead of treating it as support.

Prefer low-risk reversible experiments.
Change the smallest set of variables needed to distinguish the explanations.
Hold other material variables constant or record the confounding variables and the limits they place on the conclusion.
For intermittent or noisy results, use repeated attempts or a control sufficient to distinguish the intervention from chance.

When additional observation is needed and targeted temporary instrumentation is the least costly reliable option, add it.
Mark temporary instrumentation so it can be found and removed.
When instrumentation can affect timing, load, or state, treat that effect as a changed variable.

Confirm a cause only when it predicts the failing observation and controlling it changes the diagnostic result.
Limit the causal conclusion to what the experiment distinguishes.
Do not generalize a local cause into a broader system condition without additional evidence.
When causal confirmation is impractical, classify the explanation as unconfirmed and state the missing evidence.

This step is complete when the cause is confirmed or the strongest unconfirmed explanation and its evidence gap are explicit.

## 3. Preserve and report the diagnosis

Remove temporary instrumentation and throwaway diagnostic artifacts.

If the task includes a fix, rerun the diagnostic loop after implementation.
Also rerun the original user-level reproduction when it remains practical and materially distinct.
If a required rerun fails, report that the fix is not verified and include the observed failure.
When a required loop is unavailable, record why it could not run and the evidence used instead.

Report the applicable information:

- the confirmed or unconfirmed cause without exceeding what the experiments distinguish;
- the supporting experiments and observations;
- the repeatable diagnostic loop and baseline result;
- final verification when the task includes a fix;
- remaining uncertainty, evidence gaps, and confidence limits.

The diagnosis is complete when another maintainer can repeat or locate the available evidence, understand the conclusion and its confidence, and find no temporary diagnostic changes.
