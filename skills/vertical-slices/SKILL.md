---
name: vertical-slices
description: Use when decomposing a specification into tasks, checking a vertical slice, or routing work discovered during implementation.
---

# Vertical Slices

A **tracer bullet** is one end-to-end path that delivers one observable capability across every required integration layer.
A tracer bullet is narrow by outcome, not by file count or implementation effort.

## 1. Define and verify the slice

Record:

- One observable capability.
- The primary public seam that demonstrates the capability end to end.
- Each owned behavior and its source requirement.
- Observable acceptance criteria.
- Each prerequisite and blocking task.

The slice must start from a passing repository state and return the repository to a passing state.
The slice must contain no independent capability beyond its named capability.
Use the primary seam for acceptance evidence.
Use additional public seams for other tests.
For behavior variations and external contracts, apply [layered seams](../tdd/SKILL.md#layered-seams).

This step is complete when repository evidence demonstrates every recorded behavior through the applicable public seam.

## 2. Set task boundaries

Prefer the fewest independently verifiable tasks that preserve clear ownership and dependencies.
Split work only when it has an independently verifiable result and a distinct capability, shared contract, lifecycle, owner, or blocker.
Create a shared-contract task when multiple slices depend on the same independently verifiable contract.
Keep multiple implementation stages in one task when they serve one outcome and share ownership and dependencies.
Different files, modules, commands, test categories, or implementation hotspots do not establish independent capabilities.
A shared verification seam does not combine independent capabilities into one slice.
A preparatory task must deliver an independent contract or lifecycle change.
Keep other preparation inside the task that uses it.

When work contains multiple slices:

1. Create one flat task for each slice.
2. Link each task directly to the source specification.
3. Express ordering through `Blocked by` relationships.
4. Assign each required behavior to one owning task.
5. Create an integration task only when the integration has independent observable behavior.

This step is complete when each task split has an independently verifiable result and a distinct reason.
Every behavior must have one owner, and every dependency must be explicit.

## 3. Sequence a broad refactor

When old and new forms must coexist during migration, read and apply [Expand-Contract](EXPAND-CONTRACT.md).
When temporary coexistence is unnecessary, keep the refactor in one task.
Use ordered passing stages unless the task-boundary rules require a split.

This step is complete when every stage has a passing condition and every separate task satisfies the task-boundary rules.

## 4. Route discovered work

When implementation reveals work, classify it before changing scope:

- Keep a local implementation detail inside the current task when it serves the approved capability.
- When required work changes the approved behavior ownership or task boundary, stop and report the evidence.
- When required work is an independent prerequisite or capability, propose its task and dependency.
- Keep unrelated work outside the current task.

Wait for user approval before changing an approved task boundary.
After approval, create or update each affected task draft and the canonical task graph before implementation continues.

This step is complete when all required work belongs to an approved task.
The recorded task graph must match the approved boundaries.
