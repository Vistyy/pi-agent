---
name: to-tasks
description: "[M] Break a plan or specification into flat tracer-bullet task drafts."
disable-model-invocation: true
---

# To Tasks

Create local **tracer-bullet** task drafts from a plan or specification.
Each task must deliver one independently verifiable vertical slice or one independently justified migration stage.

## 1. Gather context

Use the conversation as context.
Read each provided local source.
Retrieve each requested external tracker source.
Read the specification and each reference required to interpret it.

This step is complete when all requirements and applicable referenced decisions are available locally.

## 2. Inspect existing ownership

Inspect:

- The current implementation and public verification seams.
- Applicable domain terms and architectural decisions.
- The canonical task graph and relevant active task drafts.
- The current owner and dependencies of each specification requirement.

Identify every specification requirement, including user stories, the solution, implementation decisions, testing requirements, and quantitative targets.
Map each requirement to exactly one active task owner, or record an ownership gap when no active task owns it.
Expand an active task when it already owns the requirement.

This step is complete when every specification requirement has exactly one existing owner or a stated ownership gap.

## 3. Apply vertical slices

Read and apply the `vertical-slices` skill.
Use that skill as the authority for task boundaries and migration sequences.
Fill each ownership gap with an independently justified vertical slice.
Preserve each specification requirement when choosing verification seams and task boundaries.
Integrate all tasks into one flat dependency graph.
Link each task directly to the source specification.

This step is complete when:

- Each specification requirement has exactly one task owner.
- Existing tasks own every applicable existing outcome.
- Each new task satisfies the `vertical-slices` completion criteria.
- Each migration stage has a passing condition.
- Each dependency is explicit.

## 4. Confirm the breakdown

Present the proposed tasks as a numbered list.
For each task, show:

- **Title**: Name the observable capability or migration stage.
- **Capability**: State the single result that the task delivers.
- **Primary verification seam**: Name the public seam that demonstrates completion.
- **Source requirements owned**: List each specification requirement and its source section.
- **Blocked by**: List each prerequisite task.

Ask the user to confirm the boundaries, ownership, verification seams, and dependencies.
Revise the breakdown until the user approves every task and dependency.

This step is complete when the user approves the complete breakdown.

## 5. Write task drafts

Before writing drafts, read and apply [the task template](TASK-TEMPLATE.md).
Write the approved drafts in dependency order, with blockers first.
When the destination is unknown, ask the user where to save the drafts.
Keep the source specification unchanged.

This step is complete when every approved task has a saved draft.
Each draft must link to the specification and each blocking task.
