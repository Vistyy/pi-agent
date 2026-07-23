# Task Draft Template

Use this template for each approved task.

<task-template>
# <Task title>

## Specification

Link directly to the specification that this task implements.

## Source requirements owned

List each specification requirement owned by this task.
Identify the source section for each requirement, including applicable decisions, testing requirements, and quantitative targets.

## What to build

Describe one vertical slice or approved migration stage.
Describe observable behavior instead of work organized by technical layer.

Reference stable decisions without specific file paths or implementation code.
When a prototype contains required design evidence, link to the preserved prototype instead of copying it.

## Primary verification seam

Name the caller-visible interface that demonstrates the task's behavior.

## Acceptance criteria

- [ ] Criterion 1
- [ ] Criterion 2
- [ ] Criterion 3

## Blocked by

Link to each blocking task.
When the task has no blocker, use `None - can start immediately.`
</task-template>

The template is complete when each section contains task-specific content and each acceptance criterion describes an observable result.
