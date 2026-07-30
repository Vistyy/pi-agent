---
name: handoff-to-worktree
description: "[M] Hand the current work to a fresh Pi session in its But Why Managed Worktree."
argument-hint: "What should the fresh session implement?"
disable-model-invocation: true
---

# Handoff to Worktree

Load the `but-why` skill before the first But Why command.
Apply the command-result verification rules from that skill.

## 1. Resolve the work

Resolve one runner and its command prefix:

- `just` maps to `just by` in the But Why source repository when the `by` recipe exists.
- `pnpx` maps to `pnpx but-why` when `pnpx` is available.
- `npx` maps to `npx -y but-why` when `pnpx` is unavailable and `npx` is available.

Report that But Why is unavailable when no runner can execute it.
Use the resolved command prefix for each direct But Why command.

When the session identifies a Task, run `<command-prefix> task show <task-id>`.
When the session identifies a taskless Change, run `<command-prefix> change show <change-id>`.
Use an existing open linked Change.
Ask the user to select the work only when the session and But Why state do not identify one target.

This step is complete when one runner and one work target are resolved.

## 2. Prepare the handoff

Write compact Markdown for the fresh Pi session.
Include the implementation goal, relevant decisions, exact artifact references, and suggested skills.
For a Task-backed Change, include the Task ID and direct the fresh session to run `<command-prefix> task context <task-id>`.
Do not include sensitive information.

This step is complete when the handoff gives the fresh session enough context to continue the selected work.

## 3. Resolve the Change

When the selected Task has no linked Change, run:

```text
<command-prefix> change start --task <task-id>
```

When selected taskless work has no Change, run:

```text
<command-prefix> change start
```

If an existing Change reports `prepare_failed`, run `<command-prefix> change prepare <change-id>` once.
If Change Start or Change Prepare fails, report the structured failure and stop.

Run `<command-prefix> change show <change-id>`.
Verify that the Change is open and ready.
Record its exact Managed Worktree path.

This step is complete when one Change is open and ready and its Managed Worktree is known.

## 4. Launch the handoff

Resolve `scripts/launch-handoff.mjs` relative to this `SKILL.md` file.
Pipe the handoff Markdown to the script:

```sh
node <skill-directory>/scripts/launch-handoff.mjs \
  --runner <just|pnpx|npx> \
  --change-id <change-id> \
  --worktree-path <managed-worktree-path> <<'BUT_WHY_HANDOFF'
<handoff Markdown>
BUT_WHY_HANDOFF
```

Do not run Change Implement separately.
Do not retry an indeterminate launch.
The companion script owns launch observation, late-start handling, Change verification, and temporary-file cleanup.

Accept `started`, `already_active`, or `late_active` only when `changeVerified` is `true`.
For any other result, report the structured result and diagnostic paths, then stop.
Keep the current Pi session open.
The fresh Herdr-hosted Pi session owns implementation in the Managed Worktree.

This workflow is complete when the script reports an accepted status with `changeVerified: true`.
