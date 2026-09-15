---
name: underengineer
description: "[M] Put the current topic through a radical simplification thought experiment and show what survives."
disable-model-invocation: true
---

# Underengineer

Use the current discussion as the target unless the user identifies another one.
If no target or underlying desired outcome is clear, ask for it and stop.
This is a thought experiment: do not implement its result or treat it as an approved scope change.

Restate the desired outcome without assuming the current solution, decomposition, or requirements are necessary.
Treat every requirement, guarantee, feature, distinction, layer, and supporting mechanism as something that must justify its survival.
Ask what can disappear, be weakened, be deferred, be handled by an existing owner or capability, or become an accepted limitation.
Try removing whole capabilities before optimizing the machinery that supports them, and account for production code, tests, fixtures, documentation, dependencies, operations, and caller obligations rather than moving complexity elsewhere.

Facts remain facts, but even an established requirement may be challenged hypothetically.
State exactly what would be lost by removing it; prior decisions remain authoritative unless the user changes them.
Do not preserve something merely because it already exists, was previously agreed, might be useful later, or would be costly to remove.
Do not manufacture removals when every part survives the challenge.

Return:

- `Minimal core` — the smallest coherent version that still achieves the underlying outcome.
- `What survives` — only the parts that re-earned their place and why.
- `What does not` — what disappears, weakens, or moves out of scope.
- `Cost of the simplification` — lost behavior, guarantees, or options, and any user decisions required before adopting it.
