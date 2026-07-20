---
name: diagnosing-bugs
description: Use when diagnosing a bug, performance regression, failure, exception, or slow behavior, especially when the cause is not immediately known.
---

# Diagnosing Bugs

Use this six-phase sequence for defects and performance regressions.
Record a reason before omitting a phase.

Before inspecting code, check for `CONTEXT-MAP.md`.
If `CONTEXT-MAP.md` exists, read it.
Use the map to select the applicable context.
If the map does not exist and the root `CONTEXT.md` exists, read the root context.
Use the applicable domain terms to identify relevant modules.
Read the ADRs for those modules and their context.

## Phase 1: Build a feedback loop

Create one command that reproduces the reported symptom.
Use its pass or fail signal for hypothesis testing, instrumentation, and bisection.

### Select the closest available loop

Use the closest available option.
If no later option is clearly closer to the reported behavior, try these options in order.

1. **Failing test**: Use the defect-reaching public seam.
2. **Curl or HTTP script**: Run the script against the development server.
3. **CLI invocation**: Compare fixture-input stdout with expected output.
4. **Headless browser script**: Inspect the DOM, console, or network with Playwright or Puppeteer.
5. **Captured trace**: Replay a real request, payload, or event log through the defect path.
6. **Throwaway harness**: Run the minimum system subset that reaches the defect.
7. **Property or fuzz loop**: Run 1,000 random inputs and detect the specified failure mode.
8. **Bisection harness**: Automate setup and verification so `git bisect run` identifies the first failing state.
9. **Differential loop**: Run the same input across two versions or configurations and compare the outputs.
10. **HITL script**: Use `scripts/hitl-loop.template.sh` for required human actions.

### Tighten the loop

Make the loop suitable for repeated diagnosis:

- Reduce setup and execution time.
- Assert the reported symptom directly.
- If time or random seeds affect the result, pin them.
- If filesystem or network state affects the result, isolate that state.

### Increase a non-deterministic reproduction rate

For an intermittent defect, measure the reproduction rate.
Repeat the trigger, run attempts in parallel, add controlled stress, or narrow the timing window.
Record a fixed attempt count and failure threshold in the command.
Use the same threshold before and after the fix.

### Report a missing loop

If you cannot create a feedback loop:

1. List each attempted reproduction method and its result.
2. Ask for a reproducing environment, captured artifact, or permission for temporary production instrumentation.
3. Wait for the required input before forming hypotheses.

Captured artifacts include a HAR file, log dump, core dump, or timestamped screen recording.

### Complete Phase 1

Phase 1 is complete after you run one command and record its invocation and output.
The command must satisfy every applicable requirement:

- [ ] **Red-capable**: It drives the actual defect path and asserts the user's reported symptom.
- [ ] **Deterministic**: It returns the same verdict for the same state.
- [ ] **Fast**: It completes in seconds rather than minutes.
- [ ] **Agent-runnable**: It runs unattended, or it uses `scripts/hitl-loop.template.sh` for required human actions.

For an intermittent defect, use a fixed attempt count and failure threshold instead of identical verdicts.
Proceed only after the red-capable command exists.

## Phase 2: Reproduce and minimize

Run the Phase 1 command.
Confirm the user's symptom.
Record the exact error, incorrect output, or timing measurement.
Repeat the command enough times to confirm its deterministic verdict or fixed intermittent threshold.

### Minimize the reproduction

Remove one input, caller, configuration value, data value, or step at a time.
After each removal, run the reproduction command.
When removing an element makes the reproduction pass, keep that element.

Phase 2 is complete when removing any remaining element makes the reproduction pass.
Use the minimal reproduction as the Phase 5 regression test.

## Phase 3: Form hypotheses

Before testing a hypothesis, create three to five hypotheses.
Rank the hypotheses by available evidence.

State a falsifiable prediction for each hypothesis:

> If <X> is the cause, changing <Y> will remove the defect or changing <Z> will increase it.

Remove or refine hypotheses without testable predictions.
Before testing, show the ranking to the user.
If the user is unavailable, continue with the recorded ranking.

## Phase 4: Instrument one prediction

Map each probe to one Phase 3 prediction.
Change one variable per run.

If these tools are available, use them in this order:

1. Use a debugger or REPL to inspect the relevant state.
2. Add targeted logs where they distinguish the hypotheses.
3. If targeted probes cannot distinguish the hypotheses, add broader logging.

Prefix every temporary debug log with a unique marker such as `[DEBUG-a4f2]`.
During cleanup, use the marker to remove all temporary instrumentation.

### Measure performance regressions

Before changing code for a performance regression, record a baseline.
Use a timing harness, `performance.now()`, a profiler, or a query plan.
If known commits, versions, datasets, or configurations bound the regression, bisect those states before applying a fix.
Use the same measurement method after each tested state and after the fix.

## Phase 5: Add a regression test and fix the defect

Use a public seam that reproduces the caller's defect.
If the defect requires multiple callers or a longer interaction chain, use a broader seam.

If no suitable public seam exists, record the architectural limitation.
Carry the limitation into Phase 6.
Otherwise:

1. Convert the minimal reproduction into a failing test at that seam.
2. Run the test and confirm failure for the reported symptom.
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

After the fix, identify every architectural condition that enabled the defect.
If the condition requires architectural work, invoke `improve-codebase-architecture` with the diagnosis evidence.
