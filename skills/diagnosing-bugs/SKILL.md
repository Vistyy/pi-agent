---
name: diagnosing-bugs
description: Use when a failure's cause is unknown, reproduction is unreliable, or evidence spans multiple systems.
---

# Diagnosing Bugs

Use controlled experiments to distinguish a cause from a plausible correlation.

If `CONTEXT-MAP.md` exists, use it to select the applicable context.
Otherwise, if the root `CONTEXT.md` exists, use the root context.
Use applicable domain terms and treat applicable ADRs as current constraints.

**Diagnostic loop**: A repeatable command or procedure that produces evidence of the reported symptom.

## 1. Establish the diagnostic loop

Record the expected behavior, observed behavior, environment, and user-visible symptom.
Select the closest practical observation point, such as a seam, workload, trace, or manual procedure.
Create the shortest diagnostic loop that preserves evidence of the user-visible symptom.
Keep the original user-level reproduction for final verification.

Automate repeated setup, execution, observation, and cleanup when practical.
When a manual action remains, record the action and why automation is impractical.

For an intermittent failure, define the attempt count and failure threshold before experimenting.
Use the same attempt count and threshold when comparing results.

Run the diagnostic loop and record its command or procedure, baseline observation, and output.
If no loop can produce evidence, report the attempted methods, missing evidence, and stopping reason.
Request the environment or artifact required to continue.

This step is complete when the diagnostic loop confirms the baseline and can evaluate an experiment.
When reproduction is blocked, stop after recording the attempts and requesting the required evidence.

## 2. Run discriminating experiments

Inspect existing errors, logs, traces, runtime state, and relevant recent changes.
Verify that each repository command and diagnostic tool exists before using it.

Before each experiment, record:

```text
Hypothesis:
Predicted observation:
Changed variable:
Actual observation:
Conclusion: supported | rejected | inconclusive
```

Change one relevant variable per experiment.
Prefer an experiment that distinguishes between competing explanations.
Use an inconclusive result to refine the next experiment instead of treating the result as support.

When existing evidence cannot distinguish the explanations, add targeted temporary instrumentation.
Prefix temporary instrumentation with a unique searchable marker such as `[DEBUG-a4f2]`.

For a performance regression, fix the workload and measurement method before recording the baseline.
Use the same workload and measurement method for every experiment.

Confirm a cause only when it predicts the failing observation and controlling the cause changes the diagnostic result.
When causal confirmation is impractical, classify the explanation as unconfirmed and state the missing evidence.

This step is complete when the cause is confirmed or the strongest unconfirmed explanation and its evidence gap are explicit.

## 3. Preserve and report the diagnosis

Remove temporary instrumentation and throwaway diagnostic artifacts.
Convert the diagnostic loop into a regression test at the closest useful public seam when practical.
Record the command, procedure, query, workload, or measurement method needed to repeat the evidence.

If the task includes a fix, follow the repository bug-fix and testing requirements.
When both loops are available, verify the fix with the focused diagnostic loop and the original user-level reproduction.
When a loop is unavailable, record why it could not run and the evidence used instead.

Report:

- The confirmed or unconfirmed cause.
- The experiments and observations that support the conclusion.
- The diagnostic loop and final result.
- The remaining uncertainty or manual verification.

When a broader codebase condition enabled the defect, recommend `/skill:improve-codebase` and include the diagnosis evidence.

The diagnosis is complete when another maintainer can repeat or locate the available evidence, understand the conclusion and its confidence, and find no temporary diagnostic changes.
