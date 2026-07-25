---
name: to-tasks-by
description: "[M] Break a plan or specification into approved But Why SQLite Tasks."
disable-model-invocation: true
---

# To Tasks By

Create approved SQLite Tasks from a plan or specification.
Use this skill when But Why is the active Task authority.
Use `to-tasks` instead when the destination is a set of local task draft files.

## 1. Gather the accepted context

Use the conversation as context.
Read the specification and each normative reference required to interpret it.
Read the installed `but-why` skill and resolve one But Why command prefix.
Read the installed `vertical-slices` skill and apply it as the authority for Task boundaries.
Use the default TOON output for direct command reads.
Use JSON only when a program parses command output.

This step is complete when all requirements, decisions, and command conventions are available.

## 2. Inspect existing Task ownership

Inspect the current implementation, public verification seams, domain terms, architecture decisions, and SQLite Task graph.
Use `task list`, `task show`, and `task context` to inspect relevant Tasks.
Map each specification requirement to exactly one existing Task or one ownership gap.
Expand an existing unstarted Task when it already owns the outcome.
Do not create a duplicate Task for owned behavior.

This step is complete when every requirement has one existing owner or one stated ownership gap.

## 3. Design tracer-bullet Tasks

Fill each ownership gap with one independently verifiable vertical slice.
For each proposed Task, define:

- Title.
- Observable capability.
- Primary verification seam.
- Source requirements owned.
- Acceptance criteria.
- Explicitly excluded behavior.
- Prerequisite Tasks.

Use Task Dependencies only for real prerequisites.
Do not use Task Dependencies to represent priority.
Order independent Tasks by creation time.

This step is complete when each requirement has one owner and every dependency is necessary and explicit.

## 4. Confirm the complete breakdown

Present the proposed new Tasks, existing Task updates, and dependency changes.
For each Task, show its capability, primary verification seam, source ownership, and prerequisites.
Ask the user to approve the complete breakdown.
Revise the breakdown until the user approves every Task boundary and dependency.

This step is complete when the user approves the complete Task graph mutation.

## 5. Write SQLite Tasks

Create approved new Tasks in prerequisite order.
For each new Task:

1. Write its complete Task Context to a temporary Markdown file.
2. Run `<but-why> task create --title "<title>" --description-file <file>`.
3. Run `<but-why> task dependencies set <task-id>` with each approved `--depends-on <prerequisite-id>`.
4. Run `<but-why> task approve <task-id>`.
5. Remove the temporary file.

For an approved update to an existing unstarted Task, use `task context draft`, edit the draft, and use `task context apply`.
Apply approved dependency changes before Change Start.
If a mutation fails after another mutation succeeds, preserve the successful mutation and report the exact partial state.
Do not start a Change.

This step is complete when every approved Task is Todo, every dependency matches the approved graph, every updated Task contains the approved context, and no new Change exists.

## 6. Verify the Task graph

Run `task show` for each created or updated Task.
Run `task list` to verify ordering, startability, and blockers.
Report the final Task IDs and dependencies.

This skill is complete when SQLite contains the approved Task graph and the next oldest startable Task is clear.
