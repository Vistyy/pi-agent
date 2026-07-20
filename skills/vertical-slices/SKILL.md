---
name: vertical-slices
description: Use when decomposing a specification into tasks, checking whether a task is a tracer-bullet vertical slice, or routing discovered work into a shared contract, lifecycle change, or independent capability.
---

# Vertical Slices

A **tracer bullet** is one narrow end-to-end path that delivers one observable capability across every required integration layer.
Give each related capability a separate implementation task.

## 1. Define the behavior

Record:

- The one observable capability delivered by the task.
- The primary public seam that demonstrates the capability end to end.
- Each owned behavior and its source requirement.
- The acceptance criteria.
- The prerequisite and blocking tasks.

Use the primary seam for acceptance evidence.
Use additional public seams for other tests.
For behavior variations and external contracts, apply [layered seams](../tdd/SKILL.md#layered-seams).

This step is complete when every item has an explicit value.

## 2. Verify the vertical slice

A vertical slice must:

- Deliver one narrow, complete capability across every required layer.
- Produce an observable result through its primary seam.
- Start from a passing repository state.
- Return the repository to a passing state before dependent work starts.
- Contain no independent capability beyond the named capability.
- Route each required shared contract, lifecycle change, migration stage, or independent capability to a declared task.

When work has independent behavior, route it to a declared task.
A slice may contain multiple commits and local implementation details.
File count does not determine slice size.
A shared verification seam does not combine independent capabilities into one slice.

This step is complete when repository evidence demonstrates every requirement.
Record the command or observation that proves the result through the primary seam.

## 3. Create flat tasks

When work contains several vertical slices:

1. Create one flat task for each vertical slice.
2. Link each task directly to the source specification.
3. Express ordering through `Blocked by` relationships.
4. Assign each required behavior to exactly one owning task.
5. When one user story contains several behaviors, let the story span multiple tasks.
6. When the integration has its own observable behavior, create a shared integration task.

This step is complete when every required behavior has one owner, every dependency is explicit, and every task satisfies the vertical-slice requirements.

## 4. Sequence a wide refactor

A **wide refactor** is a mechanical change whose affected callers cannot migrate in one independently passing slice.
Use **expand-contract**:

1. **Expand**: Add the new form beside the old form while existing callers continue to pass.
2. **Migrate**: Move callers in independently passing batches.
   Make each batch a flat task blocked by the expand task.
3. **Contract**: Remove the old form after every caller uses the new form.

If a migration batch cannot pass independently, use an integration branch.
Make each affected batch block one final integrate-and-verify task.

This step is complete when every stage states its passing condition, every migration blocks contraction, and contraction removes the replaced path.

## 5. Guard the slice during implementation

When implementation reveals work, reapply these rules.
When a local implementation detail serves only the current capability, keep it in the current task.

When repository evidence reveals a separate prerequisite:

1. Stop before implementing the prerequisite.
2. Report the evidence.
3. Explain the prerequisite's independent observable behavior.
4. Propose a flat task for the prerequisite.
5. Explain why it blocks the current task.
6. Wait for user approval.

Keep unrelated work outside the current task.
When all required prerequisites are declared and complete, continue implementation.
Every planned change must contribute to the current vertical slice.
