---
name: to-tasks
description: "[M] Break a plan or specification into flat tracer-bullet task drafts."
disable-model-invocation: true
---

# To Tasks

Break a plan into independently grabbable local tasks using thin vertical slices, also called tracer bullets.
Do not publish externally.

## 1. Gather context

Work from the conversation context.
If the user passes a local path, read it.
Do not fetch tracker references unless explicitly asked.

Completion criterion: the source specification and its normative references are available locally.

## 2. Explore the codebase

Explore enough of the repository to understand its current state, relevant public seams, domain glossary, and architectural decisions.
Look for opportunities to prefactor the code so later tracer bullets can remain thin and independently green.
Make the change easy, then make the easy change.

Completion criterion: the current implementation, primary verification seams, and known prerequisite boundaries are understood well enough to size the work.

## 3. Draft the vertical slices

Read and apply the `vertical-slices` skill.
Break normal feature work into tracer-bullet tasks that follow its vertical slice rules.
Treat a wide refactor as the exception and sequence it through the skill's expand-contract rules.
Produce one flat dependency graph whose tasks each link directly to the source specification.

Completion criterion: every required behavior has one task owner, every feature task is a thin end-to-end path, every wide-refactor stage has an explicit green-state promise, and no prerequisite is missing.

## 4. Confirm the breakdown

Present the proposed tasks as a numbered list.
For each task, show:

- **Title**: a short descriptive name.
- **Capability**: the one observable capability or migration stage it delivers.
- **Primary verification seam**: where completion will be demonstrated.
- **Behaviors owned**: the required observable behaviors assigned to it and the source requirements or user stories they trace to.
- **Blocked by**: the tasks that must complete first.

Ask the user whether the granularity, requirement ownership, verification seams, and dependencies are correct.
Revise the breakdown until the user approves it.

Completion criterion: the user has approved every task boundary and dependency.

## 5. Write local task drafts

Write each approved task using the template below.
Order the drafts by dependency, with blockers first.
If no destination is clear, ask where to save them.
Do not modify the source specification.

Completion criterion: every approved task has a saved draft, every draft links to the specification, and every blocker references another flat task.

## Task template

<task-template>
# <Task title>

## Specification

A direct reference to the specification this task implements.

## Behaviors owned

For each required observable behavior, record the source requirement, specification section, or user story from which it derives.

## What to build

A concise description of this one vertical slice or expand-contract stage.
Describe the observable behavior rather than a layer-by-layer implementation plan.

Avoid specific file paths or code snippets because they become stale quickly.
When a prototype encodes a decision more precisely than prose, add a context pointer to it instead of copying it.

## Primary verification seam

The caller-visible interface through which this task's behavior is demonstrated.

## Acceptance criteria

- [ ] Criterion 1
- [ ] Criterion 2
- [ ] Criterion 3

## Blocked by

- A reference to each blocking task

Or `None - can start immediately`.
</task-template>
