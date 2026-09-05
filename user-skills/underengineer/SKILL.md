---
name: underengineer
description: "[M] Simplify a diagnosis, plan, or proposed solution without losing established requirements."
disable-model-invocation: true
---

# Underengineer

Review the user's target or the most recent diagnosis, plan, or proposed solution.
If no target is clear, ask for one and stop.
Recommend a simpler result; do not implement it.

Separate established requirements and facts from assumptions and proposed mechanisms.
Inspect existing behavior only where it could materially change the choice, and expose unresolved decisions that could change the result.

Choose the simplest maintainable completed result that preserves the requirements and removes unsupported complexity.
Judge enduring knowledge and coordination alongside delivery cost, risk, maintenance, and reversibility; neither the smallest diff nor the cleanest final structure alone determines the choice.
Prefer a broader change only when its reduction in lasting complexity justifies its transition costs and risks.

Explain the recommended result, what must remain, what can be removed, and the material trade-offs.
Do not manufacture removals when the current proposal is already the simplest supported choice.
