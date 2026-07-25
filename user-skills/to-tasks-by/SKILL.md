---
name: to-tasks-by
description: "[M] Break a plan or specification into approved But Why SQLite Tasks."
disable-model-invocation: true
---

# To Tasks for But Why

Create approved SQLite Tasks from a plan or specification.
Use `to-tasks` when the required result is a set of local task draft files.

## Operating rules

Read the installed `but-why` skill before the first CLI command.
Resolve `<but-why>` through that skill and use the resolved prefix for every CLI command.
Use default TOON output when the agent reads a command result.
Use JSON output only when a program parses the command result.
Create only user-approved Task definitions, then approve each resulting SQLite Task.
Do not run `change start` or another command that creates a Change.

## 1. Gather the source requirements

Read the conversation, the specification, and each normative reference required to interpret the specification.
Read the installed `vertical-slices` skill and use it as the authority for Task boundaries.
Create a requirement inventory that cites each source section and each applicable accepted decision.

This step is complete when the requirement inventory covers every source requirement.
Each inventory entry cites its source and applicable accepted decisions.

## 2. Inspect existing ownership

Inspect the current implementation, public verification seams, domain terms, architecture decisions, and SQLite Task graph.
Run `<but-why> task list`.
Run `<but-why> task show <task-id>` and `<but-why> task context <task-id>` for each relevant Task.
Run `<but-why> change list` and record the existing Changes before any mutation.
Assign each requirement to one existing Task or one ownership gap.
Assign a requirement to an existing Task only when that Task owns the same observable capability.
The existing Task must have no Change.

This step is complete when an ownership table covers every requirement.
Each table row names one Task ID or one stated ownership gap.

## 3. Design tracer-bullet Tasks

Fill each ownership gap with one independently verifiable vertical slice.
Define these fields for each proposed Task:

- Title.
- Observable capability.
- Primary verification seam.
- Source requirements owned.
- Acceptance criteria.
- Explicitly excluded behavior.
- Prerequisite Tasks.

Use Task Dependencies for real prerequisites only.
Represent priority among independent Tasks through creation order.

This step is complete when each requirement has one owner.
Each new Task has one capability.
Each dependency is a necessary prerequisite.

## 4. Confirm the complete breakdown

Present each proposed new Task, existing Task update, and dependency change.
For each Task, show every field defined in Step 3.
Ask the user to approve all Task boundaries, requirement ownership, acceptance criteria, exclusions, creation order, and dependencies.
Revise the complete breakdown after each requested change.

This step is complete when the user explicitly approves the complete breakdown.

## 5. Write the approved SQLite Tasks

Create each user-approved new Task in prerequisite order.
For each new Task:

1. Write the complete Task Context to a temporary Markdown file outside the repository.
2. Run `<but-why> task create --title "<title>" --description-file <file>`.
3. Run `<but-why> task dependencies set <task-id>` with each approved `--depends-on <prerequisite-id>`.
4. Run `<but-why> task approve <task-id>`.
5. Remove the temporary file.

Before an existing Task update, run `<but-why> task show <task-id>` and confirm that the Task has no Change.
Run `<but-why> task context draft <task-id>`, edit the draft, and run `<but-why> task context apply <task-id>`.
Run `<but-why> task dependencies set <task-id>` with the approved prerequisites before the Task starts a Change.
If the updated Task is New, run `<but-why> task approve <task-id>`.

If a CLI mutation fails after a prior mutation succeeds, stop the mutation sequence.
Report each successful Task ID, the failed command, and the current Task states.
Leave the successful durable mutations intact.

This step is complete when each created or updated Task is Todo.
Each Task contains the approved Task Context.
Each Task has the approved dependencies.

## 6. Verify the durable result

Run `<but-why> task show <task-id>` for each created or updated Task.
Run `<but-why> task list` to verify creation order, startability, and blockers.
Run `<but-why> change list` and compare the result with the Change list recorded in Step 2.
Verify that this skill created no Change.
Report the final Task IDs, dependencies, and next oldest startable Task.

This skill is complete when SQLite contains the user-approved Task graph and the Change list is unchanged.
