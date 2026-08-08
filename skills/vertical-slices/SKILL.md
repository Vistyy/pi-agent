---
name: vertical-slices
description: Use when decomposing approved requirements into vertical tasks or routing work discovered during implementation.
---

# Vertical Slices

## Terms

**Bounded supported result**: A completed state that is distinguishable from the prior supported state, is independently acceptable progress toward approved intent, and can be implemented, reviewed, and verified coherently.

**Task dependency**: A relationship required only when one Task cannot be implemented or verified until another Task is complete.

Use this file to design a Task graph.
When implementation reveals work that may change scope, read and apply [Route Discovered Work](references/ROUTE-DISCOVERED-WORK.md).

## Design the graph

1. Establish approved intent and its authoritative sources.
   Do not infer approval from brainstorming or provisional planning.
2. Account for every approved requirement exactly once across the Task graph.
   Assign each approved behavior and constraint to one Task.
   Do not omit, defer, replace, or narrow approved behavior to make a Task smaller.
3. Create one Task for each bounded supported result.
   A quality, theme, final objective, shared owner, shared implementation area, or preferred sequence is not by itself a Task result.
4. Split approved intent when it contains multiple bounded supported results.
   Do not merge results to minimize the number of Tasks or because they contribute to one final objective.
   Do not split solely by files, modules, layers, commands, test categories, or implementation effort.
5. Treat implementation, review, or verification difficulty as evidence that the proposed boundary must be reconsidered.
   If no practical bounded result is clear, present the evidence and obtain a decision from the applicable authority before recording the Task.
6. Add a dependency only when its definition applies.
   Related work, shared files, likely conflicts, priority, or recording order do not establish a dependency.

Acceptance criteria describe the supported result and constraints without prescribing verification mechanisms.
A preparatory activity is a separate Task only when its output is itself an approved bounded supported result.

## Migrations

When old and new forms must coexist, read and apply [Expand-Contract](references/EXPAND-CONTRACT.md).
A migration stage or caller population can be a Task when it ends in an approved coherent supported state with a bounded passing condition.
The final target does not require all migration stages to remain in one Task.
