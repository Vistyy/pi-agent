---
name: underengineer
description: "[M] Simplify a diagnosis, plan, or proposed solution without losing established requirements."
disable-model-invocation: true
---

# Underengineer

Review the target identified by the user, or the most recent diagnosis, plan, or proposed solution.
If no target is clear, ask for one and stop.
Do not implement it.

## Derive the result

Separate what is established from what is assumed or merely proposed.
Do not turn examples or possible future needs into requirements.
Expose conflicts or missing decisions that could change the result.

Inspect only existing behavior and structure that could materially change the choice.
Choose the simplest maintainable completed result that satisfies the established requirements.
Judge simplicity by how much enduring knowledge and coordination the completed result requires.
Do not use delivery convenience as a proxy for final simplicity.
Consider delivery cost only when it makes the otherwise best result infeasible.

Remove anything no established requirement needs.
Prefer a broader change only when it eliminates lasting complexity instead of moving or adding it.

## Present the result

Return these sections in order:

1. `Simplest version` - recommend one completed result and explain why it is simplest.
2. `What must remain` - list only established considerations that determine the result.
3. `Remove or reconsider` - include only material unsupported complexity or unresolved decisions, and omit the section when none remain.

Keep implementation effort separate from the recommendation.
