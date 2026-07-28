---
name: to-tasks-by
description: "[M] Break approved requirements into approved But Why Tasks."
disable-model-invocation: true
---

# To Tasks for But Why

Create approved But Why Tasks from user-approved requirements.
Use `to-tasks` when the required result is local task draft files.
Read and apply the installed `but-why`, `vertical-slices`, and `tdd` skills.
This skill creates or updates Tasks and their dependencies.
It does not start Changes.

## 1. Establish requirement ownership

Read the user-approved requirement input and the references required to interpret it.
Use the repository's documentation authority map when one exists.
Do not infer authority from a file name, directory name, or a label such as specification.
Treat historical material only as evidence unless the user explicitly approves it as a current requirement source.
Inspect the relevant implementation, decisions, and current Tasks.
Assign each requirement to one existing Task or one ownership gap.
Expand an unstarted Task when it already owns the same observable capability.

This step is complete when every requirement has one Task owner or one stated ownership gap.

## 2. Design tracer-bullet Tasks

Fill each ownership gap with one independently verifiable vertical slice.
For each new or updated Task, define:

- The observable capability.
- The primary verification seam.
- The authoritative requirement source, when one exists, and the requirements owned.
- The acceptance criteria.
- The prerequisites.

Apply the TDD skill when selecting each verification seam.
Keep Task Context focused on information that a reader needs to understand the approved intent.
Do not duplicate metadata that But Why stores and displays separately, such as Task state, Task Dependencies, linked Changes, or timestamps.
Record Task Dependencies through the dependency graph instead of adding a prerequisite list to Task Context.
Include dependency rationale in Task Context only when the rationale is necessary to understand the approved intent.
Acceptance criteria must describe behavior and constraints instead of test counts, test categories, coverage targets, or repository-wide verification commands.
Use dependencies only for real prerequisites.
Do not encode implementation priority as a Task Dependency or infer priority from Task age or ID.
Choose the next Task through explicit impact triage when the user asks to start work.

This step is complete when each requirement has one owner and each Task has one capability.
Each dependency is necessary.

## 3. Confirm the breakdown

Present the complete proposed Task graph.
For each Task, show the title, capability, verification seam, requirement ownership, acceptance criteria, and prerequisites.
Ask the user to approve every Task boundary, recording order, and dependency.
Recording order does not establish implementation priority.
Revise the complete graph until the user approves it.

This step is complete when the user explicitly approves the complete Task graph.

## 4. Record the approved Tasks

Create new Tasks in approved dependency order.
Set each Task's approved dependencies and approve the Task.
Update an existing unstarted Task through the Task Context draft and apply commands.
If a command fails after an earlier mutation succeeds, stop and report the exact partial state.

Verify every created or updated Task and its dependencies.
Report the final Task IDs and the startable Tasks.
Do not select the next Task unless the user asks for impact triage.

This skill is complete when each recorded Task matches the approved Task graph and has no Change.
