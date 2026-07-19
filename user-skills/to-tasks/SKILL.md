---
name: to-tasks
description: "[M] Break a plan or specification into flat tracer-bullet task drafts."
disable-model-invocation: true
---

# To Tasks

Break a plan into local **tracer-bullet** task drafts.
Each task must deliver one independently verifiable vertical slice.
Keep the drafts local.

## 1. Gather context

Use the current conversation as context.
If the user provides a local path, read that file.
Retrieve an external tracker reference only when the user requests it.

This step is complete when the source specification and its normative references are available locally.

## 2. Inspect the repository

Identify:

- The current implementation.
- The relevant public seams.
- The applicable domain terms.
- The applicable architectural decisions.
- Existing changes that can make later slices independently pass.

Include a preparatory change only when it reduces the later slice without adding independent behavior.

This step is complete when the implementation, verification seams, and prerequisite boundaries are explicit.

## 3. Draft vertical slices

Read and apply the `vertical-slices` skill.
Create one tracer-bullet task for each normal feature slice.
For a wide refactor, use the skill's expand-contract sequence.
Create one flat dependency graph.
Link each task directly to the source specification.

This step is complete when:

- Every required behavior has one task owner.
- Every feature task is one end-to-end vertical slice.
- Every wide-refactor stage states its passing condition.
- Every prerequisite has a task and dependency relationship.

## 4. Confirm the breakdown

Present the proposed tasks as a numbered list.
For each task, show:

- **Title**: Name the observable capability or migration stage.
- **Capability**: State the one result that the task delivers.
- **Primary verification seam**: Name the public seam that demonstrates completion.
- **Behaviors owned**: List each owned behavior and its source requirement.
- **Blocked by**: List each task that must complete first.

Ask the user to confirm task boundaries, behavior ownership, verification seams, and dependencies.
Revise the breakdown until the user approves it.

This step is complete when the user approves every task and dependency.

## 5. Write task drafts

Write each approved task with the template below.
Order drafts by dependency, with blockers first.
If the destination is unknown, ask the user where to save the drafts.
Keep the source specification unchanged.

This step is complete when every approved task has a saved draft.
Each draft must link to the specification and to every blocking task.

## Task template

<task-template>
# <Task title>

## Specification

Link directly to the specification that this task implements.

## Behaviors owned

List each required observable behavior.
For each behavior, identify its source requirement, specification section, or user story.

## What to build

Describe the one vertical slice or expand-contract stage.
Describe observable behavior rather than work organized by technical layer.

Reference stable decisions without specific file paths or implementation code.
When a prototype contains required design evidence, link to the preserved prototype instead of copying it.

## Primary verification seam

Name the caller-visible interface that demonstrates the task's behavior.

## Acceptance criteria

- [ ] Criterion 1
- [ ] Criterion 2
- [ ] Criterion 3

## Blocked by

- Link to each blocking task.

Use `None - can start immediately.` when the task has no blocker.
</task-template>
