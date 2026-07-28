---
name: vertical-slices
description: Use when decomposing approved requirements into tasks, checking a vertical slice, or routing work discovered during implementation.
---

# Vertical Slices

A **task-level tracer bullet** is one end-to-end path that delivers one observable capability across every required integration layer.
A task-level tracer bullet is narrow by outcome, not by file count or implementation effort.
Apply each section required by the current invocation.
Task decomposition uses sections 1 and 2.
When task decomposition includes a broad migration, also use section 3.
Implementation checks use section 4.
Scope routing uses sections 2 and 5.

## 1. Define each slice

For each slice, record:

- One observable capability.
- Each owned behavior and its authoritative requirement source.
- One primary public seam that demonstrates the complete capability.
- Observable acceptance criteria.

Acceptance criteria must describe required behavior and constraints.
Acceptance criteria must not prescribe test counts, test categories, or coverage targets.
Acceptance criteria must not prescribe repository-wide verification commands unless the capability owns repository verification.

When selecting verification seams, read and apply the [TDD seam policy](../tdd/SKILL.md#select-public-seams).
Use the primary seam for one complete acceptance path.
Use cheaper public seams for behavior variations when they prove the behavior reliably.

This step is complete when the proposed slices cover every approved requirement exactly once.
Each proposed slice must have one capability, one primary public seam, and observable acceptance criteria.

## 2. Set task boundaries

Prefer the fewest independently verifiable Tasks that preserve clear ownership and necessary dependencies.
Split work only when each resulting Task has an independently verifiable result.
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

When old and new forms must coexist, read and apply [Expand-Contract](EXPAND-CONTRACT.md).
When temporary coexistence is unnecessary, keep the migration in one Task.
Create separate migration Tasks only when each stage has an independently verifiable result and a passing condition.

This step is complete when each migration stage can finish in a supported state.
Every separate stage must satisfy the Task-boundary rules.

## 4. Verify an implemented slice

Use this section for task-level acceptance verification.
Use TDD to construct tests and run red-green cycles.
Use this section to evaluate the resulting implementation evidence against the approved Task.

When checking an implemented slice, trace every owned behavior through its applicable public seam.
Confirm one complete acceptance path through the primary seam.
Confirm behavior variations and external contracts through the cheapest reliable seams.

Read the repository development instructions to identify the supported gate.
The repository must pass that gate before the slice is complete.
If the Task owns an existing gate failure, record that failure as part of the approved starting condition.
A recorded starting failure does not change the final passing requirement.

This step is complete when repository evidence demonstrates every owned behavior and the supported repository gate passes.

## 5. Route discovered work

When implementation reveals work, classify the work before changing scope:

- Keep a local implementation detail inside the current Task when it serves the approved capability.
- Stop and report evidence when required work changes approved behavior ownership or a Task boundary.
- Propose a separate Task and necessary dependency when required work has an independent capability or prerequisite.
- Keep unrelated work outside the current Task.

Wait for user approval before changing an approved Task boundary.
After approval, create or update every affected Task artifact.
Update the canonical Task graph before implementation continues.

This step is complete when all required work belongs to an approved Task.
The recorded Task graph must match the approved boundaries.
