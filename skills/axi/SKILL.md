---
name: axi
description: Use when building, modifying, or reviewing a CLI that agents run through shell execution.
---

# Agent eXperience Interface (AXI)

AXI defines ergonomic standards for building CLI tools that autonomous agents interact with through shell execution.

## Completion criterion

An AXI pass is complete when every modified or reviewed command accounts for stdout format, default schema, truncation, aggregate counts, empty states, errors, exit codes, prompts, output channels, no-args behavior, contextual help, and `--help`.
When the change includes hooks, plugins, setup commands, or installable skills, also review session integration.
Verify opt-in setup, idempotence, directory scoping, lifecycle capture, and token budget.

## Before you start

Before implementing or changing TOON output syntax, read the [TOON specification](https://toonformat.dev/reference/spec.html) and verify generated stdout is valid TOON.

## 1. Token-efficient output

Use [TOON](https://toonformat.dev/) (Token-Oriented Object Notation) as the output format on stdout.
TOON provides ~40% token savings over equivalent JSON while remaining readable by agents.
Convert to TOON at the output boundary.
Keep internal logic on JSON.

```
tasks[2]{id,title,status,assignee}:
  "1",Fix auth bug,open,alice
  "2",Add pagination,closed,bob
```

## 2. Minimal default schemas

Every field in stdout costs tokens, multiplied by row count in collections.
Default to the smallest schema that lets the agent decide what to do next: typically an identifier, a title, and a status.

- Use three or four fields in a default list schema.
- Set the default limit from observed or documented collection sizes.
  When most repositories contain fewer than 100 labels, use a default of 100 instead of 30.
- Put bodies and descriptions in detail views.
- Provide `--fields` for explicit additional fields.

## 3. Content truncation

Detail views often contain large text fields.
Omitting them forces agents to hunt; including them wastes tokens.
Truncate by default and tell the agent how to get the full version.

```
task:
  number: 42
  title: Fix auth bug
  state: open
  body: First 500 chars of the issue body...
    ... (truncated, 8432 chars total)
help[1]: Run `tasks view 42 --full` to see complete body
```

- Never omit large fields entirely; include a truncated preview
- Show the total size so the agent knows how much it's missing
- Suggest the escape hatch (`--full`) only when content is actually truncated
- Choose a truncation limit that covers most use cases (500-1500 chars)

## 4. Pre-computed aggregates

The most expensive token cost is often not a longer response.
It is a follow-up call.
If your backend has data that agents commonly need as a next step, compute it and include it.

**Aggregate counts**: include the **total count** in list output, not just the page size.
Agents need "how many are there?" and will paginate if the answer isn't definitive.

```
count: 30 of 847 total
tasks[30]{number,title,state}:
  1,Fix auth bug,open
  ...
```

**Derived status fields**: Include a related-state summary when agents usually need that state for the next action and the backend can provide it at an acceptable cost.

```
task:
  number: 42
  title: Deploy pipeline fix
  state: open
  checks: 3/3 passed
  comments: 7
```

Use a summary such as `3/3 passed` instead of the complete related data.

## 5. Definitive empty states

When the answer is "nothing", say so explicitly.
Ambiguous empty output causes agents to re-run with different flags to verify.

```
$ tasks list --state closed
tasks: 0 closed tasks found in this repository
```

State the zero with context.
Make it clear the command succeeded.
The absence of results is the answer.

## 6. Structured errors & exit codes

### Idempotent mutations

Return exit code `0` when the target resource already has the requested state.
Report that the mutation was a no-op.
Use a non-zero exit code when the requested state cannot be reached.

```
$ tasks close 42
task: #42 already closed (no-op)    # exit 0
```

### Structured errors on stdout

Errors go to **stdout** in the same structured format as normal output, so the agent can read and act on them.
Include what went wrong and an actionable suggestion.
Never let raw dependency output (API errors, stack traces) leak through.

```
error: --title is required
help: tasks create --title "..." [--body "..."]
```

- Validate required flags before calling any dependency
- Translate errors: extract actionable meaning and discard noise
- Never leak dependency names; suggestions reference your CLI's commands, not the underlying tool

### No interactive prompts

Every operation must be completable with flags alone.
If a required value is missing, fail immediately with a clear error.
Do not prompt for it.
Suppress prompts from wrapped tools.

### Output channels

- **stdout**: all structured output the agent consumes: data, errors, suggestions
- **stderr**: debug logging, progress indicators, diagnostics (agents don't read this)
- **Exit codes**: 0 = success (including no-ops), 1 = error, 2 = usage error

Never mix progress messages into stdout.
An agent that reads "Fetching data..." will try to interpret it as data.

## 7. Ambient context via session integrations

Add session integration when directory-scoped live state can change the agent's next action before the agent runs a command.
Session integration must be explicit opt-in, idempotent, directory-scoped, lifecycle-aware, and token-budget-aware.
Read [`SESSION-INTEGRATIONS.md`](SESSION-INTEGRATIONS.md) when implementing hooks, plugins, or installable Agent Skills.

## 8. Home view

When invoked without arguments, show the home view.
Identify the tool before the live data.

The home view must include:

- The absolute path of the current executable, with the user's home directory collapsed to `~`.
- A one-sentence description of the CLI.
- Directory-scoped live state that supports the next command choice.
- Commands supported by the displayed state when another action is required.

```
$ tasks
bin: ~/.local/bin/tasks
description: Manage project tasks in the current workspace
tasks[3]{id,title,status}:
  1,Fix auth bug,open
  2,Add pagination,open
  3,Update docs,closed
help[2]:
  Run `tasks view <id>` to see full details
  Run `tasks create --title "..."` to add a task
```

## 9. Contextual disclosure

Use contextual disclosure to expose commands that are valid for the returned state.

Rules:

- After an open item, include the applicable mutation command.
- After an empty list, include the applicable create command.
- After a list, include the detail command with an `<id>` placeholder.
- Carry forward disambiguating flags such as `--repo` and `--source`.
- Use placeholders such as `<id>` and `"<title>"` for values that the agent must select.
- Omit suggestions from detail views, counts, and confirmations that fully answer the request.
- Offer valid alternatives without prescribing an unnecessary sequence.
- When a list is truncated, state the total and include the command that returns all items.
- Keep pagination details out of TOON array headers.
- After an error, include the command that corrects the reported problem.

## 10. Consistent way to get help

Every subcommand should support `--help` with a concise, complete reference: available flags with defaults, required arguments, and 2-3 usage examples.
Keep it focused on the requested subcommand.
Do not dump the entire CLI's manual.
