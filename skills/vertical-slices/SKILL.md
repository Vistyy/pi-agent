---
name: vertical-slices
description: Use when decomposing approved requirements into vertical Tasks or routing work discovered during implementation.
---

# Vertical Slices

A slice is one end-to-end path that delivers one observable capability across every required integration layer.
A slice is narrow by outcome, not by file count or implementation effort.

Use this file to design a Task graph.
When implementation reveals work that may change scope, read and apply [Route Discovered Work](references/ROUTE-DISCOVERED-WORK.md).

## 1. Define each slice

For each slice, record:

- One observable capability.
- Each owned behavior and its authoritative requirement source.
- Observable acceptance criteria.

Acceptance criteria must describe required behavior and constraints.
Acceptance criteria must not prescribe verification mechanisms.

Do not infer approval from brainstorming or provisional planning.
If requirement approval is unclear, resolve it with the applicable authority before setting Task boundaries.

This step is complete when the proposed slices cover every approved requirement exactly once.
Each proposed slice must have one capability and observable acceptance criteria.

## 2. Set Task boundaries

Prefer the fewest independently verifiable Tasks that preserve clear ownership and necessary dependencies.
Task sizing must not remove, defer, replace, or narrow approved behavior.
Treat implementation size as a reason to look again for a valid Task boundary, not as permission to reduce approved scope.
Split work only when each resulting Task has an independently verifiable supported result.
If no such split exists, keep the capability in one Task even when it is large.
Each split must also have a distinct capability, shared contract, lifecycle, owner, or blocker.
Create a shared-contract Task only when the shared contract is independently verifiable and multiple slices require it.
Keep implementation stages in one Task when they serve one capability and share ownership and dependencies.

Files, modules, commands, test categories, implementation hotspots, and shared verification seams do not establish separate capabilities.
A preparatory Task must deliver an independently usable contract or lifecycle change.
Keep other preparation inside the Task that uses it.
Create an integration Task only when the integration has independent observable behavior.

Add a Task Dependency only when the dependent Task cannot be implemented or verified until the prerequisite Task is Done.
Related work, shared files, likely conflicts, preferred sequence, age, identifiers, and relative importance do not establish a Task Dependency.
Do not encode implementation priority as a Task Dependency.

This step is complete when every requirement has one Task owner.
Every Task must have one capability.
Every Task Dependency must be necessary.

## 3. Sequence a broad migration

When old and new forms must coexist, read and apply [Expand-Contract](references/EXPAND-CONTRACT.md).
When temporary coexistence is unnecessary, keep the migration in one Task.
Create separate migration Tasks only when each stage has an independently verifiable result and a passing condition.

This step is complete when each migration stage can finish in a supported state.
Every separate stage must satisfy the Task-boundary rules.
