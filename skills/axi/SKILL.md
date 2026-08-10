---
name: axi
description: Use when building, modifying, or reviewing a CLI that agents run through shell execution.
---

# Agent eXperience Interface (AXI)

AXI defines ergonomic standards for CLI tools that autonomous agents run through shell execution.

## Completion criterion

An AXI pass is complete when each command behavior materially in scope follows the applicable sections below and the applicable verification claims are established through the supported CLI interface.
Do not change behavior or collect new evidence solely to satisfy an inapplicable section.
Reuse existing evidence for unchanged behavior.

Read [Session Integrations](references/SESSION-INTEGRATIONS.md) only when the change includes session integration, such as a hook, plugin, setup command that installs or repairs it, or an approved installable Agent Skill delivery option.
When session integration applies, verify opt-in setup, idempotence, directory scoping, lifecycle capture, and token budget.

For implemented changes, capture only the command observations required by the applicable verification claims, including stdout, stderr, or the exit code as relevant.
Reuse one observation when it covers equivalent paths or multiple claims.

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

- Set an applicable default limit from observed or documented collection sizes.
- Put bodies and descriptions in detail views when list decisions do not require them.
- Provide `--fields` only when the supported command needs selectable fields beyond the default schema.

When an included field exceeds an established output limit, provide a truncated preview and total size.
If current work introduces truncation without an established limit, make that output-policy decision explicit.
When content is truncated, provide an escape hatch.
When content is complete, omit the escape hatch.

```text
task:
  number: 42
  title: Fix auth bug
  state: open
  body: First 500 chars of the issue body...
    ... (truncated, 8432 chars total)
help: Run `tasks view 42 --full` to see complete body
```

Include aggregate data only when it supports a current agent decision and the backend can provide it at acceptable cost.

- Include the total count when the agent must interpret the result beyond the page size.
- Include derived state or related-data summaries when they materially determine the next action.

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
Include the problem and an actionable suggestion when one is known and useful.

- Validate required flags before calling dependencies.
- Translate known dependency errors when doing so provides actionable meaning.
- Keep raw dependency output, stack traces, and dependency names out of stdout.
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

When directory-scoped live state has evidence-backed value for changing the agent's next action before command execution, add session integration.
Session integration must be explicit opt-in, idempotent, directory-scoped, lifecycle-aware, and token-budget-aware.

## Home view

Define a noninteractive structured response for a no-argument invocation.
Use a home view when it supports command discovery or the next action.
When a home view includes live state, identify the tool before live data and include only directory-scoped state material to the next choice.
Include applicable content from this list:

- The current executable's absolute path, with the user's home directory collapsed to `~`.
- A one-sentence CLI description.
- Commands supported by the displayed state when another action is required.

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

When contextual suggestions materially help select a next action, include only commands valid for the returned state.
Preserve applicable disambiguating flags and use placeholders for values the agent must select.
Omit suggestions when the result fully answers the request, and offer alternatives without prescribing an unnecessary sequence.
For truncated output or a known error, include an escape or correction command only when it is useful and available.
Keep pagination details out of array headers in formats that have array headers.

## Help

Support `--help` on every subcommand.
Provide a concise, complete reference.
Include available flags and defaults.
Identify required arguments.
Provide usage examples only when they clarify non-trivial usage.
Keep help focused on the requested subcommand.
Do not dump the entire CLI manual.
