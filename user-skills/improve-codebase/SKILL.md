---
name: improve-codebase
description: "[M] Find evidence-backed opportunities that make future code changes easier and safer."
disable-model-invocation: true
---

# Improve Codebase

Recommend the smallest evidence-backed change that reduces the cost, risk, or uncertainty of future maintenance.
Deletion, local simplification, tooling, tests, structural change, and no change are all valid outcomes.

If `CONTEXT-MAP.md` exists, use it to select the applicable context.
Otherwise, if the root `CONTEXT.md` exists, use the root context.
Use applicable domain terms and treat applicable ADRs as current constraints.

## 1. Find maintenance evidence

If the user names a module, subsystem, task, or recurring problem, start there.
Otherwise, scan recent repository history broadly but shallowly.
Inspect commit intent, changed paths, repeated co-changes, linked issues, and test or build failures.
Group changes that appear to perform the same maintenance task.

Inspect a small representative sample of the strongest pattern.
Read the relevant diffs, current implementation, callers, tests, and repository commands.
Confirm that the historical friction still exists in the current code.
Widen the history only when more evidence could change the selected pattern or its scope.

Look for observed costs in these categories:

- Discovery: maintainers repeatedly struggle to locate or understand behavior.
- Change surface: one conceptual change requires coordinated edits in many places.
- Reasoning: hidden rules, states, ordering, or shared state make local reasoning unreliable.
- Verification: tests or checks are slow, brittle, incomplete, or difficult to set up.
- Custom code: the repository maintains behavior that an existing tool or library could provide more simply.
- Operation: changes are difficult to migrate, observe, deploy, or reverse.
- Obsolete complexity: dead paths, compatibility layers, duplicate helpers, or stale configuration remain active maintenance concerns.

This step is complete when one observed maintenance cost is supported by named files, changes, failures, tests, or commands.
If the repository provides insufficient evidence, report that result and stop.

## 2. Explain the cause and scope

Separate verified facts, inferences, and unknowns.
Trace the current dependencies, runtime flow, ownership, and verification path that produce the observed cost.
Define the observable improvement, such as fewer edit locations, less caller knowledge, less custom code, simpler verification, or automatic failure detection.

Use the narrowest scope supported by the evidence.
Widen from a local change to a module or subsystem change only when several maintenance tasks share the same cause.
Require evidence across multiple subsystems before recommending a repository-wide architectural shift.

This step is complete when the cause, supported scope, and observable improvement are explicit.

## 3. Select the intervention

Consider only interventions that address the observed cause:

- Delete obsolete or duplicate code.
- Improve names, navigation, or local documentation.
- Simplify control flow, state, or data representation.
- Replace custom code with an existing tool or library.
- Add a deterministic check or generator.
- Improve tests, fixtures, feedback speed, or observability.
- Change ownership, an interface, a seam, or a module structure.
- Improve migration, rollout, or recovery behavior.
- Keep the current design.

Compare each credible intervention by expected maintenance reduction, new concepts, dependencies, interfaces, indirection, migration work, test burden, operational risk, and reversibility.
Prefer the smallest intervention that produces the observable improvement.

When a foundational library may replace custom code, use the `library-orientation` skill before recommending the dependency.
When the cause of a recurring failure is unknown, use the `diagnosing-bugs` skill before recommending a fix.
When the intervention changes ownership, a module interface, a seam, an adapter, or a test surface, use the `codebase-design` skill.
When the intervention changes domain vocabulary or relationships, use the `domain-modeling` skill.

This step is complete when one intervention, including no change, has stronger evidence and lower total cost than its credible alternatives.

## 4. Present the recommendation

Return concise prose with:

- The observed maintenance cost and its evidence.
- The underlying cause and supported scope.
- The recommended intervention.
- The expected observable improvement.
- The added complexity, migration cost, and main risk.
- The method for verifying the improvement.

Present multiple options only when evidence leaves a genuine decision unresolved.
When the user explicitly requests visual review, use the `lavish` skill.

The review is complete when the user can decide whether to accept the recommendation without reconstructing the investigation.
