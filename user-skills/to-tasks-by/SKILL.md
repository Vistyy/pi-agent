---
name: to-tasks-by
description: "[M] Record approved requirements as approved But Why Tasks."
disable-model-invocation: true
---

# To Tasks for But Why

Record user-approved requirements as approved But Why Tasks.
This skill creates or updates Tasks and Task Dependencies.
This skill does not start Changes.
An existing Change handoff remains governed by the `but-why` Change implementation workflow.
This skill may record approved discovered work without altering or replacing that Change.

Before running a But Why command, resolve the command prefix and apply the command-result verification rules available in the current session.
Before designing the Task graph, read and apply the installed `vertical-slices` skill.

## 1. Gather the approved input

Read the user-approved requirements and every reference required to interpret them.
Use the repository documentation authority map when one exists.
Do not infer authority from a file name, directory name, or document label.
Treat historical material only as evidence unless the user approves it as a current requirement source.

Inspect the relevant implementation, decisions, and current Tasks.
Identify the current Task owner for each requirement.
Identify an ownership gap when no current Task owns the requirement.

This step is complete when every approved requirement and applicable decision is available.
Each requirement must have one current Task owner or one stated ownership gap.

## 2. Build the proposed Task graph

Apply `vertical-slices` to the approved requirements and current ownership.
Expand an unstarted Task when that Task already owns the same observable capability.
Create a proposed Task for each remaining ownership gap.

For each proposed Task, present:

- The title.
- The observable capability.
- The primary verification seam.
- The authoritative requirements owned.
- The acceptance criteria.

Present proposed Task Dependencies as graph edges outside Task Context.
Keep Task Context limited to approved intent that an implementer needs.
Do not copy Task state, Task Dependencies, linked Changes, identifiers, or timestamps into Task Context.
Include dependency rationale in Task Context only when the rationale is necessary to understand the approved intent.

Do not select implementation priority unless the user requests impact triage.
Recording order must place prerequisite Tasks before dependent Tasks.
Recording order does not establish implementation priority.

This step is complete when every requirement has one proposed Task owner.
The proposed graph must satisfy the applicable Task-design criteria from `vertical-slices`.

## 3. Confirm the proposed graph

Present the complete proposed Task graph before any mutation.
Ask the user to approve each Task boundary, Task Context, recording order, and Task Dependency.
Revise the complete graph until the user approves it.

This step is complete when the user explicitly approves the complete Task graph.

## 4. Record the approved graph

Create new Tasks in the approved recording order.
Update an existing unstarted Task through the Task Context draft and apply commands.
Set each Task's complete approved dependency set through the But Why dependency graph.
Record an empty dependency set when the approved Task has no prerequisite.
Approve each created or updated Task after its Task Context and Task Dependencies match the approved graph.

After each mutation, apply the `but-why` mutation-verification rules.
If a command fails after an earlier mutation succeeds, stop and report the exact partial state.

Verify that every created or updated Task matches the approved graph and has no Change.
Report the final Task identifiers and every startable Task.
Do not select the next Task unless the user requests impact triage.

This skill is complete when every approved Task and Task Dependency is persisted.
Every recorded Task must be approved and have no Change.
