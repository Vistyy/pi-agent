---
name: axi
description: Use when building, modifying, or reviewing a CLI that agents run through shell execution.
---

# Agent eXperience Interface (AXI)

AXI defines ergonomic standards for CLI tools that autonomous agents run through shell execution.

## Completion criterion

An AXI pass is complete when every modified or reviewed command accounts for:

- Stdout format.
- Default schema.
- Truncation.
- Aggregate counts.
- Empty states.
- Errors.
- Exit codes.
- Prompts.
- Output channels.
- No-args behavior.
- Contextual help.
- `--help`.

When the change includes hooks, plugins, setup commands, or installable skills, also review session integration.
Verify opt-in setup, idempotence, directory scoping, lifecycle capture, and token budget.

For implemented changes, validate each affected behavior through the supported CLI interface.
Record the observed stdout, stderr, and exit code for each applicable success, empty, error, mutation, no-argument, and help case.

## Output format

Do not assume TOON as the output format.
Use the format selected by the user or project.
Use the established project format when none is selected; do not introduce TOON.
Use TOON only after the user or project explicitly selects and approves it.
After TOON is selected and approved, use it consistently for the CLI's structured stdout, including errors, mutations, empty states, and session context.

Before changing selected TOON syntax, read the [TOON specification](https://toonformat.dev/reference/spec.html).
Verify that generated stdout is valid TOON.
Keep internal logic independent of the selected output format and serialize at the output boundary.

The following examples describe fields and values without selecting an output syntax:

```text
items: 2 records
  id: 1; title: Fix auth bug; status: open; assignee: alice
  id: 2; title: Add pagination; status: closed; assignee: bob
```

## Default output

Use the smallest stdout schema that lets the agent decide what to do next.

- Use three or four fields in a default list schema.
- Set the default limit from observed or documented collection sizes.
- Put bodies and descriptions in detail views.
- Provide `--fields` for additional fields.

Include every large detail field.
When a large detail field exceeds the default limit, include a truncated preview and the total size.
When content is truncated, provide an escape hatch.
When content is complete, omit the escape hatch.
Choose a documented limit that covers common use cases.

```text
task:
  number: 42
  title: Fix auth bug
  state: open
  body: First 500 chars of the issue body...
    ... (truncated, 8432 chars total)
help: Run `tasks view 42 --full` to see complete body
```

When the backend can provide commonly needed aggregate data at acceptable cost, include it.

- Include the total count in list output, not only the page size.
- Include derived state summaries that commonly determine the next action.
- Summarize related data, for example with `checks: 3/3 passed` and `comments: 7`.

```text
count: 30 of 847 total
tasks: 30 records
  number: 1; title: Fix auth bug; state: open
  ...
```

State empty results explicitly with their context.
Make clear that the command succeeded.

```text
$ tasks list --state closed
tasks: 0 closed tasks found in this repository
```

## Errors, mutations, and interaction

When an idempotent mutation already has the requested state, return exit code `0`.
Report the no-op.
When the requested state cannot be reached, return a non-zero exit code.

```text
$ tasks close 42
task: #42 already closed (no-op)    # exit 0
```

Return errors on stdout in the same structured format as normal output.
Include the problem and an actionable suggestion.

- Validate required flags before calling dependencies.
- Translate dependency errors into actionable meaning.
- Discard raw dependency output, stack traces, and dependency names.
- Reference the CLI's commands in suggestions.

```text
error: --title is required
help: tasks create --title "..." [--body "..."]
```

Complete every operation with flags alone.
When a required value is missing, fail immediately with a clear error.
Suppress prompts from wrapped tools.

Use channels as follows:

- **stdout**: Structured data, errors, and suggestions consumed by the agent.
- **stderr**: Debug logging, progress indicators, and diagnostics.
- **Exit codes**: `0` for success, including no-ops; `1` for errors; `2` for usage errors.

Keep progress messages out of stdout.

## Session integration

When directory-scoped live state can change the agent's next action before command execution, add session integration.
Session integration must be explicit opt-in, idempotent, directory-scoped, lifecycle-aware, and token-budget-aware.
When implementing hooks, plugins, or installable Agent Skills, read [`SESSION-INTEGRATIONS.md`](references/SESSION-INTEGRATIONS.md).

## Home view

When the CLI has no arguments, show the home view.
Identify the tool before live data.
Include:

- The current executable's absolute path, with the user's home directory collapsed to `~`.
- A one-sentence CLI description.
- Directory-scoped live state that supports the next command choice.
- When another action is required, commands supported by the displayed state.

```text
$ tasks
bin: ~/.local/bin/tasks
description: Manage project tasks in the current workspace
tasks: 3 records
  id: 1; title: Fix auth bug; status: open
  id: 2; title: Add pagination; status: open
  id: 3; title: Update docs; status: closed
help:
  Run `tasks view <id>` to see full details
  Run `tasks create --title "..."` to add a task
```

## Contextual disclosure

Expose only commands valid for the returned state.

- After an open item, include its applicable mutation command.
- After an empty list, include its applicable create command.
- After a list, include the detail command with an `<id>` placeholder.
- Carry disambiguating flags such as `--repo` and `--source` into suggestions.
- Use placeholders such as `<id>` and `"<title>"` for values the agent must select.
- When a detail view, count, or confirmation fully answers the request, omit suggestions.
- Offer valid alternatives without prescribing an unnecessary sequence.
- When a list is truncated, state the total.
- For a truncated list, include the command that returns all items.
- Keep pagination details out of array headers in formats that have array headers.
- After an error, include the command that corrects the reported problem.

## Help

Support `--help` on every subcommand.
Provide a concise, complete reference.
Include available flags and defaults.
Identify required arguments.
Provide two or three usage examples.
Keep help focused on the requested subcommand.
Do not dump the entire CLI manual.
