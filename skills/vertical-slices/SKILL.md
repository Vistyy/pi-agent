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
2. Use one Task unless the work contains more than one independently acceptable bounded supported result and separating those results helps delivery or review.
   Do not omit or weaken approved behavior to make a Task smaller.
3. Keep work together when an intermediate state has no independent value or would leave the repository unsupported.
   Do not split merely by files, modules, layers, commands, test categories, implementation steps, or effort.
4. Describe each Task clearly enough to communicate its outcome and consequential constraints.
   Use whatever structure communicates that intent without requiring a complete graph, requirement allocation, review-path inventory, or standard Task Context format.
5. Add a Task Dependency only when its definition applies.
   Related work, shared files, likely conflicts, priority, or preferred sequence do not establish a dependency.

Use prior implementation evidence when it materially changes a proposed boundary.
Do not require a failed-attempt history or matrix.

Decomposition is sufficient when each proposed Task communicates its bounded outcome and every proposed dependency is a real prerequisite.

## Route discovered work

When implementation reveals work that may change accepted intent or a Task boundary, read [Route Discovered Work](references/ROUTE-DISCOVERED-WORK.md).

## Migrations

When evidence shows that old and new forms must coexist during a migration, read [Expand-Contract](references/EXPAND-CONTRACT.md).
Do not load that reference merely because a change replaces one representation with another.
