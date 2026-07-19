---
name: diagnosing-bugs
description: Use when diagnosing a bug, performance regression, failure, exception, or slow behavior, especially when the cause is not immediately known.
---

# Diagnosing Bugs

Use this sequence to diagnose defects and performance regressions.
Omit a phase only when you record the reason.

Before you inspect code, read `CONTEXT-MAP.md` if it exists and select the applicable context.
Otherwise, read the root `CONTEXT.md` if it exists.
Use the applicable domain terms to identify the relevant modules.
Read the ADRs for those modules and their context.

## Phase 1: Build a feedback loop

First, create one command that can reproduce the reported symptom.
The command provides the pass or fail signal for hypothesis testing, instrumentation, and bisection.

### Select the closest available loop

Try these options in order unless a later option is clearly closer to the reported behavior:

1. **Failing test**: Use the public seam that reaches the defect.
2. **Curl or HTTP script**: Run it against a development server.
3. **CLI invocation**: Use fixture input and compare stdout with the expected output.
4. **Headless browser script**: Use Playwright or Puppeteer to inspect the DOM, console, or network.
5. **Captured trace**: Replay a real request, payload, or event log through the applicable code path.
6. **Throwaway harness**: Run the minimum system subset that reaches the defect.
7. **Property or fuzz loop**: Run 1,000 random inputs and detect the specified failure mode.
8. **Bisection harness**: Automate setup and verification so `git bisect run` can identify the first failing state.
9. **Differential loop**: Run the same input through two versions or configurations and compare the outputs.
10. **HITL script**: Use `scripts/hitl-loop.template.sh` when a human action is required.

### Tighten the loop

Improve the loop until it is suitable for repeated diagnosis:

- Reduce setup and execution time.
- Assert the reported symptom directly.
- Pin time and random seeds when they affect the result.
- Isolate filesystem and network state when they affect the result.

### Increase a non-deterministic reproduction rate

For an intermittent defect, measure the reproduction rate.
Repeat the trigger, run attempts in parallel, add controlled stress, or narrow the timing window.
Record the fixed attempt count and the observed failure threshold in the command.
Use the same threshold before and after the fix.

### Report a missing loop

If you cannot create a feedback loop:

1. List each attempted reproduction method and its result.
2. Ask for access to an environment that reproduces the defect, a captured artifact, or permission for temporary production instrumentation.
3. Wait for the required input before you form hypotheses.

Captured artifacts can include a HAR file, log dump, core dump, or screen recording with timestamps.

### Complete Phase 1

Phase 1 is complete when you have run one command and recorded its invocation and output.
The command must satisfy every applicable requirement:

- [ ] **Red-capable**: It drives the actual defect path and asserts the user's reported symptom.
- [ ] **Deterministic**: It returns the same verdict for the same state.
- [ ] **Fast**: It completes in seconds rather than minutes.
- [ ] **Agent-runnable**: It runs unattended, or it uses `scripts/hitl-loop.template.sh` for required human actions.

For an intermittent defect, replace identical verdicts with a fixed attempt count and failure threshold.
Proceed to Phase 2 only after the red-capable command exists.

## Phase 2: Reproduce and minimize

Run the Phase 1 command and confirm that it reports the user's symptom.
Record the exact error, incorrect output, or timing measurement.
Repeat the command enough times to confirm its deterministic verdict or fixed intermittent threshold.

### Minimize the reproduction

Remove one input, caller, configuration value, data value, or step.
Run the reproduction command after each removal.
Keep an element only when removing it makes the reproduction pass.

The minimal reproduction reduces the number of possible causes.
It can also become the regression test in Phase 5.

Phase 2 is complete when removing any remaining element makes the reproduction pass.

## Phase 3: Form hypotheses

Create three to five hypotheses before you test any hypothesis.
Rank them by the available evidence.

For each hypothesis, state a falsifiable prediction:

> If <X> is the cause, changing <Y> will remove the defect or changing <Z> will increase it.

Remove or refine any hypothesis that has no testable prediction.
Show the ranked list to the user before testing it.
If the user is unavailable, continue with the recorded ranking.

## Phase 4: Instrument one prediction

Map each probe to one prediction from Phase 3.
Change one variable for each run.

Use tools in this order when they are available:

1. Use a debugger or REPL to inspect the relevant state.
2. Add targeted logs at the locations that distinguish the hypotheses.
3. Add broader logging only when targeted probes cannot distinguish them.

Prefix every temporary debug log with a unique marker such as `[DEBUG-a4f2]`.
Use the marker to remove all temporary instrumentation during cleanup.

### Measure performance regressions

For a performance regression, record a baseline before changing code.
Use a timing harness, `performance.now()`, a profiler, or a query plan.
When known commits, versions, datasets, or configurations bound the regression, bisect those states before applying a fix.
Measure with the same method after each tested state and after the fix.

## Phase 5: Add a regression test and fix the defect

Use a public seam that reproduces the defect as it occurs for the caller.
A unit seam is insufficient when the defect requires multiple callers or a longer interaction chain.

If no suitable public seam exists, record that architectural limitation.
Carry the limitation into Phase 6.

If a suitable seam exists:

1. Convert the minimal reproduction into a failing test at that seam.
2. Run the test and confirm that it fails for the reported symptom.
3. Apply the minimum fix.
4. Run the regression test and confirm that it passes.
5. Run the original Phase 1 command against the complete scenario.

## Phase 6: Clean up and record the cause

Complete every applicable item before reporting completion:

- [ ] The original Phase 1 command passes.
- [ ] The regression test passes, or the missing seam is documented.
- [ ] All `[DEBUG-...]` instrumentation is removed.
- [ ] Throwaway diagnostic artifacts are deleted or stored in a clearly named debug location.
- [ ] The successful hypothesis is recorded in the commit or pull-request message.

After the fix, identify any architectural condition that enabled the defect.
If the condition requires architectural work, invoke `improve-codebase-architecture` with the evidence from this diagnosis.
