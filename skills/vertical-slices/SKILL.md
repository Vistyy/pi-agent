---
name: vertical-slices
description: Use when decomposing approved requirements into vertical tasks or routing work discovered during implementation.
---

# Vertical Slices

## Terms

**Vertical slice**: An end-to-end path that delivers one observable capability across every required integration layer.
A vertical slice is narrow by outcome, not by file count or implementation effort.

**Valid task boundary**: A division where each resulting task has an independently verifiable supported result and a distinct capability, shared contract, lifecycle, owner, or blocker.

**Task dependency**: A relationship required only when one task cannot be implemented or verified until another task is complete.

Use this file to design a task graph.
When implementation reveals work that may change scope, read and apply [Route Discovered Work](references/ROUTE-DISCOVERED-WORK.md).

## 1. Define each slice

For each slice, record:

- One observable capability.
- Each owned behavior and its authoritative requirement source.
- Observable acceptance criteria.

Acceptance criteria must describe required behavior and constraints.
Acceptance criteria must not prescribe verification mechanisms.

Do not infer approval from brainstorming or provisional planning.
If requirement approval is unclear, resolve it with the applicable authority before setting task boundaries.

This step is complete when the proposed slices cover every approved requirement exactly once.
Each proposed slice must have one capability and observable acceptance criteria.

## 2. Set task boundaries

Prefer the fewest independently verifiable tasks that preserve clear ownership and necessary dependencies.
Task sizing must not remove, defer, replace, or narrow approved behavior.
Treat implementation size as a reason to look again for a valid task boundary, not as permission to reduce approved scope.
Split work only at a valid task boundary.
If no valid task boundary exists, keep the capability in one task even when it is large.
Create a shared-contract task only when the shared contract is independently verifiable and multiple slices require it.
Keep implementation stages in one task when they serve one capability and share ownership and dependencies.

Files, modules, commands, test categories, implementation hotspots, and shared verification seams do not establish separate capabilities.
A preparatory task must deliver an independently usable contract or lifecycle change.
Keep other preparation inside the task that uses it.
Create an integration task only when the integration has independent observable behavior.

Add only task dependencies that satisfy the definition above.
Related work, shared files, likely conflicts, preferred sequence, age, identifiers, and relative importance do not establish a task dependency.
Do not encode implementation priority as a task dependency.

This step is complete when every requirement has one task owner and every task has one capability.

## 3. Sequence a broad migration

When old and new forms must coexist, read and apply [Expand-Contract](references/EXPAND-CONTRACT.md).
When temporary coexistence is unnecessary, keep the migration in one task.
Create separate migration tasks only at valid task boundaries and give each stage a passing condition.

This step is complete when each migration stage can finish in a supported state.
