---
name: vertical-slices
description: Use when decomposing a specification into tasks, checking whether a task is a tracer-bullet vertical slice, or routing discovered work into a shared contract, lifecycle change, or independent capability.
---

# Vertical Slices

A **tracer bullet** is one narrow end-to-end path that delivers an observable capability.
The path crosses every integration layer required for that capability.
Several related capabilities still require separate implementation tasks.

## 1. Define the behavior

Record:

- The one observable capability that the task delivers.
- The primary public seam that demonstrates the capability end to end.
- Each required behavior that the task owns.
- The source requirement for each owned behavior.
- The acceptance criteria.
- The prerequisite and blocking tasks.

The primary seam provides acceptance evidence.
Other tests can use additional public seams.
Apply [layered seams](../tdd/SKILL.md#layered-seams) for behavior variations and external contracts.

This step is complete when every listed item has an explicit value.

## 2. Verify the vertical slice

A vertical slice must:

- Deliver one narrow and complete capability.
- Cross every layer required to expose that capability.
- Produce an observable result through its primary seam.
- Start from a passing repository state.
- Return the repository to a passing state before dependent work starts.
- Contain no independent capability beyond the one named for the slice.
- Route each required shared contract, lifecycle change, migration stage, or other independent capability to a declared task when it has independent behavior.

A slice can contain multiple commits and local implementation details.
File count does not determine slice size.
A shared verification seam does not combine independent capabilities into one slice.

This step is complete when repository evidence demonstrates every listed requirement.
Record the command or observation that proves the result through the primary seam.

## 3. Create flat tasks

When work contains several vertical slices:

1. Create one flat task for each vertical slice.
2. Link each task directly to the source specification.
3. Express ordering through `Blocked by` relationships.
4. Assign each required behavior to exactly one owning task.
5. Let one user story span multiple tasks when it contains several behaviors.
6. Create a shared integration task only when the integration has its own observable behavior.

This step is complete when every required behavior has one owner and every dependency is explicit.
Each task must also pass the vertical-slice requirements.

## 4. Sequence a wide refactor

A **wide refactor** is one mechanical change whose affected callers cannot migrate in one independently passing slice.
Use **expand-contract**:

1. **Expand**: Add the new form beside the old form while existing callers continue to pass.
2. **Migrate**: Move callers in independently passing batches.
   Represent each batch as a flat task blocked by the expand task.
3. **Contract**: Remove the old form after every caller uses the new form.

If a migration batch cannot pass independently, use an integration branch.
Make each affected batch block one final integrate-and-verify task.

This step is complete when every stage states its passing condition.
Every migration must block contraction, and contraction must remove the replaced path.

## 5. Guard the slice during implementation

Reapply these rules when implementation reveals additional work.
Keep a local implementation detail in the current task when it serves only the current capability.

If repository evidence reveals a separate prerequisite:

1. Stop before implementing the prerequisite.
2. Report the evidence.
3. Explain the prerequisite's independent observable behavior.
4. Propose a flat task for the prerequisite.
5. Explain why it blocks the current task.
6. Wait for user approval.

Keep unrelated work outside the current task.

Implementation can continue when all required prerequisites are declared and complete.
Every planned change must contribute to the current vertical slice.
