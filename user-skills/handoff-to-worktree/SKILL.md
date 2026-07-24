---
name: handoff-to-worktree
description: "[M] Hand the current work to a fresh Pi session in its But Why Managed Worktree."
argument-hint: "What should the fresh session implement?"
disable-model-invocation: true
---

# Handoff to Worktree

## 1. Resolve the command and current work

Use `just by` when the current repository is the But Why source repository and provides that recipe.
Otherwise, use `pnpx but-why` when `pnpx` is available.
Use `npx -y but-why` when `pnpx` is unavailable and `npx` is available.
Report that But Why is unavailable when none of these commands can run.
Use the resolved command prefix for every But Why invocation in this workflow.
The command templates below use `<but-why>` for that resolved prefix.

Infer from the current session whether the work belongs to a Task-backed Change or a taskless Change.
When the session identifies a Task, run `<but-why> task show <task-id> --output json` to confirm the Task and inspect its linked Change.
When the session identifies an existing taskless Change, run `<but-why> change show <change-id> --output json` to confirm it.
Use an open linked Change when one exists.
Ask the user to select the work only when the session and But Why state do not identify one unambiguous target.

This step is complete when one command prefix and one work target are resolved and any existing open Change is known.

## 2. Create the handoff

Create a compact handoff document for the fresh Pi session.
Include the next implementation goal, relevant decisions, references to existing artifacts, and suggested skills.
For a Task-backed Change, include the Task ID and direct the fresh session to run `<but-why> task context <task-id>`.
Reference existing artifacts by path or URL instead of copying them.
Exclude sensitive information.

Create the handoff in the operating system temporary directory:

```sh
handoff_file="$(mktemp "${TMPDIR:-/tmp}/but-why-handoff.XXXXXX.md")"
trap 'rm -f "$handoff_file"' EXIT
```

Keep temporary-file creation, Change Implement, and cleanup in one shell process so the trap remains active.

This step is complete when the temporary file contains the compact handoff and cleanup is armed.

## 3. Resolve the Change

When the resolved Task has no linked Change, run:

```sh
<but-why> change start --task <task-id> --output json
```

When the work is taskless and has no existing Change, run:

```sh
<but-why> change start --output json
```

When an open Change already exists, use its Change ID instead of starting another Change.
If the existing Change reports `prepare_failed`, run `<but-why> change prepare <change-id> --output json` once.
If Change Start or Change Prepare fails, report the structured failure in the current session and stop.
Read the Change ID and Managed Worktree path from the JSON result or from `<but-why> change show <change-id> --output json`.

This step is complete when one ready open Change and its Managed Worktree are known.

## 4. Launch the fresh session

Run:

```sh
<but-why> change implement <change-id> --handoff-file "$handoff_file" --output json
```

If Change Implement fails, report the structured failure in the current session and stop.
Remove the handoff file after Change Implement returns.
Keep the current Pi session open without copying, forking, switching, or retargeting it.
The fresh Herdr-hosted Pi session owns implementation in the Managed Worktree.

This workflow is complete when Change Implement returns `started` or `already_active` and the temporary handoff file no longer exists.
