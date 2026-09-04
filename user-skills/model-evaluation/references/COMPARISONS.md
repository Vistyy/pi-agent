# Comparisons and Reliability

## Match the design to the claim

For a causal claim about an instruction or other intervention, compare configurations that differ only in that intervention where feasible.
Hold the task, environment, model, thinking level, tools, and relevant context constant within each comparison.
When comparing models themselves, identify the model as the intended difference and report any unavoidable configuration differences.
If multiple factors change together, limit the conclusion to the combined configuration rather than attributing the effect to one factor.

A control is necessary for a claimed treatment effect, not for every diagnosis or capability check.
When deciding whether to keep scaffolding, examine both acceptable behavior and the practical benefit or protection it provides over the control.
Do not require a measured improvement to honor an explicit user preference or product requirement.

## Control avoidable bias

Use realistic equivalent tasks and isolated trial state.
Keep reference answers, private rubrics, prior trial results, and evaluation metadata out of candidate context unless they are part of normal supported use.
Check for leakage through files, session inheritance, Git history, and shared state when those paths are available.
Preserve legitimate task context, including ordinary tests and public acceptance criteria.

Use matched cases and compare within each supported model when asking whether an instruction helps across a mixed-model roster.
Do not assign one instruction version exclusively to one model and another version to a different model, then attribute the difference to the instruction.
Randomize or interleave execution order when time or dependency drift could affect results.
Keep judge-facing labels neutral and conceal the expected winner.

## Choose repetition from the decision

Use repeated trials when variability could materially change the conclusion.
Choose case diversity and repetition according to the decision's consequences, observed variance, and cost rather than a fixed trial count.
Distinguish uncertainty across repeated runs of one case from uncertainty about coverage of real tasks.
A small exploratory run can expose a failure but may not distinguish small improvements or establish reliability.

Define consequential acceptance criteria before examining comparative results.
Report case-level outcomes, repeated-trial distributions, and uncertainty where material.
Use first-attempt performance unless the supported system actually retries or selects among candidates.
Do not report best-of-many performance as what a user receives from one attempt.
Report results per model when a pooled average could hide a failing supported configuration.

## Interpret differences

Separate invalid setup, contaminated trials, grader failures, and valid behavioral failures.
Do not compare only favorable survivors after asymmetric failures or rerun failures until they disappear.
Retain enough failed evidence to diagnose the difference.
Inspect discrepancies before attributing them to model randomness.

For a claimed improvement, report both its magnitude and whether it matters to the decision.
Account for regressions, cost, and latency rather than selecting only the favorable metric.
No observed difference in a small or saturated case set does not prove equivalence.
Before removing protective scaffolding, use cases that genuinely exercise its target failure and check for unintended regressions.
Limit removal claims to the tested configurations; no finite evaluation proves a failure impossible.
