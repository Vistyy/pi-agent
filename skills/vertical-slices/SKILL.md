---
name: vertical-slices
description: Use when decomposing approved requirements into vertical tasks or routing work discovered during implementation.
---

# Vertical Slices

## Terms

**Bounded supported result**: A completed state that leaves the repository safe and usable and is independently acceptable progress toward approved intent.

**Task Dependency**: A prerequisite relationship required because one Task cannot be implemented or verified until another Task is complete.

## Choose Task boundaries

1. Establish the approved outcome and its authoritative sources.
   Do not infer approval from brainstorming or provisional planning.
2. Find the smallest coherent vertical slices that each leave a bounded supported result.
   Each slice must be independently understandable, implementable, reviewable, and verifiable.
   A slice need not deliver standalone end-user value when it is acceptable progress toward the approved outcome.
   Do not omit or weaken approved behavior from the complete Task set to make an individual Task smaller.
3. Split separable behavior when doing so reduces material review or verification reasoning without leaving the repository unsupported.
   Split signals include separate observable behaviors, external integrations, lifecycle or recovery rules, durable state changes, or materially different verification environments.
   Do not combine separable behavior only because it contributes to one product outcome.
4. Keep work together when a narrower result would leave the repository unsafe or unsupported, require temporary duplicated interfaces, or have no independently verifiable behavior.
   Do not split merely by files, modules, layers, test categories, implementation steps, line count, estimated effort, or difficulty.
   Use one Task only when no narrower bounded supported result exists.
5. Describe each Task clearly enough to communicate its outcome and consequential constraints.
   Use whatever structure communicates that intent without requiring a complete graph, requirement allocation, review-path inventory, or standard Task Context format.
6. Add a Task Dependency only when its definition applies.
   Related work, shared files, likely conflicts, priority, or preferred sequence do not establish a dependency.

Use prior implementation evidence when it materially changes a proposed boundary.
Do not require a failed-attempt history or matrix.

Decomposition is sufficient when each proposed Task communicates its bounded outcome and every proposed dependency is a real prerequisite.

## Route discovered work

Keep discovered work in the current Task when it is necessary for the accepted outcome, remains within accepted intent, and can be completed safely with the current result.
Keep unrelated work outside the Task.

Preserve completed work and ask the applicable authority when discovered work:

- changes accepted intent;
- creates a genuinely separate bounded supported result; or
- makes safe completion of the accepted Task impossible.

Do not reroute work merely because implementation spans several files or modules, takes more effort than expected, or needs several forms of verification.
After an authority approves a Task boundary, dependency, or intent change, update only the approved record before implementation continues.
Do not mutate authoritative Task records when their accepted content has not changed.

## Migrations

When evidence shows that old and new forms must coexist during a migration, read [Expand-Contract](references/EXPAND-CONTRACT.md).
Do not load that reference merely because a change replaces one representation with another.
