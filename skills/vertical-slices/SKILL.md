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
5. Before recording each Task, state its supported completion result in one sentence.
   Identify any included behavior that can be delivered later while leaving that result safe, usable, and independently acceptable.
   Assign that behavior to another Task with its own bounded supported result.
   State the one coherent judgment that relates the complete result's behavior groups, state relationships, interface changes, and required evidence and shows why they form one bounded supported result that a human can understand and judge.
   A sequence of review areas, passes, or verification mechanisms does not supply that judgment.
   Use available repository evidence, including prior implementation attempts, when judging whether this review path is practical.
   When available evidence has disproved a review path, do not reuse that path or a materially equivalent Task boundary unless concrete evidence shows why the observed mismatch no longer applies.
   The review path is not a detailed implementation plan or an estimate of exact files, lines, or effort.
6. Treat implementation, review, or verification difficulty as evidence that the proposed boundary must be reconsidered.
   Treat multiple independently understandable behavior groups, state relationships, interface changes, or verification arguments as boundary evidence requiring either a split or concrete evidence that they form one bounded supported result.
   Calling them one subsystem or lifecycle is not that evidence.
   No single file, line, effort, or verification count determines the boundary.
   When required verification shows no practical coherent implementation, review, and evidence path, reconsider the boundary or present the concern to the applicable authority before recording the Task.
   If no practical review path or bounded result is clear, present the evidence and obtain a decision from the applicable authority before recording the Task.
7. Add a dependency only when its definition applies.
   Related work, shared files, likely conflicts, priority, or recording order do not establish a dependency.

Acceptance criteria describe the supported result and constraints without prescribing verification mechanisms.
A preparatory activity is a separate Task only when its output is itself an approved bounded supported result.

## Migrations

When old and new forms must coexist, read and apply [Expand-Contract](references/EXPAND-CONTRACT.md).
A migration stage or caller population can be a Task when it ends in an approved coherent supported state with a bounded passing condition.
The final target does not require all migration stages to remain in one Task.
