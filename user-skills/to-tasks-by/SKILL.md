---
name: to-tasks-by
description: "[M] Break a plan or specification into approved But Why Tasks."
disable-model-invocation: true
---

# To Tasks for But Why

Create approved But Why Tasks from a plan or specification.
Use `to-tasks` when the required result is local task draft files.
Read and apply the installed `but-why` and `vertical-slices` skills.
This skill creates or updates Tasks and their dependencies.
It does not start Changes.

## 1. Establish requirement ownership

Read the specification and the references required to interpret it.
Inspect the relevant implementation, decisions, and current Tasks.
Assign each requirement to one existing Task or one ownership gap.
Expand an unstarted Task when it already owns the same observable capability.

This step is complete when every requirement has one Task owner or one stated ownership gap.

## 2. Design tracer-bullet Tasks

Fill each ownership gap with one independently verifiable vertical slice.
For each new or updated Task, define:

- The observable capability.
- The primary verification seam.
- The source specification links and requirements owned.
- The acceptance criteria.
- The prerequisites.

Use dependencies only for real prerequisites.
Use creation order to prioritize independent Tasks.

This step is complete when each requirement has one owner and each Task has one capability.
Each dependency is necessary.

## 3. Confirm the breakdown

Present the complete proposed Task graph.
For each Task, show the title, capability, verification seam, requirement ownership, acceptance criteria, and prerequisites.
Ask the user to approve every Task boundary, update, creation order, and dependency.
Revise the complete graph until the user approves it.

This step is complete when the user explicitly approves the complete Task graph.

## 4. Record the approved Tasks

Create new Tasks in approved dependency order.
Set each Task's approved dependencies and approve the Task.
Update an existing unstarted Task through the Task Context draft and apply commands.
If a command fails after an earlier mutation succeeds, stop and report the exact partial state.

Verify every created or updated Task and its dependencies.
Report the final Task IDs and the next oldest startable Task.

This skill is complete when each recorded Task matches the approved Task graph and has no Change.
