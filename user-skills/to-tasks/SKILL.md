---
name: to-tasks
description: "[M] Write an approved plan or specification as local Task draft files."
disable-model-invocation: true
---

# To Tasks

Write local Task draft files from a user-approved plan or specification.
Use `to-tasks-by` when the required result is approved But Why Tasks.
Before designing the Task graph, read and apply the installed `vertical-slices` skill.

## 1. Gather the approved input

Read the user-approved plan or specification and every reference required to interpret it.
Extract every user story, solution requirement, implementation decision, testing requirement, and quantitative target.
Preserve extracted testing requirements and quantitative targets as source requirements.
Do not convert them into acceptance criteria or Task boundaries unless `vertical-slices` assigns them that role.
Retrieve each requested external source.
Inspect the current implementation, applicable domain terms, architectural decisions, canonical Task graph, and active Task drafts.

Identify the current Task owner for each requirement.
Identify an ownership gap when no active Task owns the requirement.

This step is complete when every approved requirement and applicable decision is available.
Each requirement must have one current Task owner or one stated ownership gap.

## 2. Build the proposed Task graph

Apply `vertical-slices` to the approved requirements and current ownership.
Expand an active Task draft when that draft already owns the same observable capability.
Create a proposed Task for each remaining ownership gap.
Link each proposed Task to its authoritative source when one exists.

This step is complete when every requirement has one proposed Task owner.
The proposed graph must satisfy the applicable Task-design criteria from `vertical-slices`.

## 3. Confirm the proposed graph

Present the complete proposed Task graph as a numbered list.
For each Task, show its title, capability, primary verification seam, requirements owned, acceptance criteria, and Task Dependencies.
Ask the user to approve each boundary, owner, verification seam, recording order, and Task Dependency.
Revise the complete graph until the user approves it.

This step is complete when the user explicitly approves the complete Task graph.

## 4. Write the approved drafts

Before writing drafts, read and apply [the Task template](TASK-TEMPLATE.md).
When the destination is unknown, ask the user where to save the drafts.
Write the approved drafts in recording order with prerequisite Tasks before dependent Tasks.
Render each Task Dependency in the template's `Blocked by` section.
Keep the source requirements unchanged.

Verify that every draft matches the approved graph.
Verify each authoritative-source link and Task Dependency link.

This skill is complete when every approved Task has one saved draft and every saved dependency matches the approved graph.
