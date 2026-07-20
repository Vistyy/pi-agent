---
name: to-tasks
description: "[M] Break a plan or specification into flat tracer-bullet task drafts."
disable-model-invocation: true
---

# To Tasks

Break a plan or specification into local **tracer-bullet** task drafts.
Each task must deliver one independently verifiable vertical slice.
Keep drafts local.

## 1. Gather context

Use the conversation as context.
When the user provides a local path, read that file.
When the user requests an external tracker reference, retrieve it.

This step is complete when the source specification and its normative references are available locally.

## 2. Inspect the repository

Identify:

- The current implementation.
- Relevant public seams.
- Applicable domain terms.
- Applicable architectural decisions.
- Existing changes that can make later slices pass independently.

A preparatory change is valid only if it reduces a later slice without adding independent behavior.

This step is complete when the implementation, verification seams, and prerequisite boundaries are explicit.

## 3. Draft vertical slices

Read and apply the `vertical-slices` skill.
Create one tracer-bullet task for each normal feature slice.
For a wide refactor, use the skill's expand-contract sequence.
Create one flat dependency graph.
Link each task directly to the source specification.

This step is complete when:

- Each required behavior has one task owner.
- Each feature task is one end-to-end vertical slice.
- Each wide-refactor stage states its passing condition.
- Each prerequisite has a task and dependency relationship.

## 4. Confirm the breakdown

Present the proposed tasks as a numbered list.
For each task, show:

- **Title**: Name the observable capability or migration stage.
- **Capability**: State the single result the task delivers.
- **Primary verification seam**: Name the public seam that demonstrates completion.
- **Behaviors owned**: List each owned behavior and its source requirement.
- **Blocked by**: List each prerequisite task.

Ask the user to confirm task boundaries, behavior ownership, verification seams, and dependencies.
Revise the breakdown until the user approves every task and dependency.

## 5. Write task drafts

Write each approved task with the template below.
Order drafts by dependency, with blockers first.
When the destination is unknown, ask where to save the drafts.
Keep the source specification unchanged.

This step is complete when every approved task has a saved draft.
Each draft must link to the specification and every blocking task.

## Task template

<task-template>
# <Task title>

## Specification

Link directly to the specification that this task implements.

## Behaviors owned

List each required observable behavior.
For each behavior, identify its source requirement, specification section, or user story.

## What to build

Describe one vertical slice or expand-contract stage.
Describe observable behavior, not work organized by technical layer.

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

When the task has no blocker, use `None - can start immediately.`
</task-template>
