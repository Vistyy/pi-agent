---
name: gh-axi
description: "Use for GitHub issues, pull requests, CI runs, workflows, releases, repository metadata, labels, search, or raw GitHub API operations."
---

# gh-axi

Run commands as `pnpm dlx gh-axi <command>`.
When output suggests `gh-axi ...`, add the `pnpm dlx` prefix before running it.

`gh-axi` requires an installed and authenticated [`gh`](https://cli.github.com/) CLI.
If authentication fails, ask the user to run `gh auth login`.

## Procedure

1. Select the narrowest command for the requested GitHub object.
   If the task does not identify an issue, pull request, run, workflow, release, or repository, use the dashboard to discover it.
   Run the dashboard as `pnpm dlx gh-axi`.
   Completion: the first command addresses the identified object or discovers the missing identifier.

2. Set the repository for cross-repository operations.
   For dedicated commands, add `--repo=owner/name` after the command, such as `pnpm dlx gh-axi issue list --repo=owner/name`.
   Do not use `--repo` or `-R` with `api`; put the repository identity in the explicit REST API path.
   Completion: every cross-repository dedicated command contains the repository flag.

3. Follow relevant `help:` hints.
   Run a hinted command when it produces evidence or completes an operation within the requested GitHub scope.
   Completion: no relevant hinted command remains.

## Select commands

### Issues and pull requests

Use `issue list`, `issue view <n>`, `pr view <n>`, and `pr checks <n>` before using `search` or `api`.

### CI

Use `run list` to select a run.
Use `run view <id> --job <job-id>` or `run view --job <job-id> --log-failed` for a failing job.
When output includes `full_log`, search that file for content omitted from the displayed tail.

### Markdown mutations

For a multiline body, comment, or release note:

1. Write the UTF-8 content to a file.
2. Pass the file with `--body-file <path>`.

### API operations

Use `api` when no dedicated command supports the operation.
For REST, put the repository identity in the explicit API path, such as:

`pnpm dlx gh-axi api repos/{owner}/{repo}/topics`

Do not use the global `--repo` or `-R` flags with `api`.
For GraphQL, `graphql` is the API path, not a nested command.
Use an explicit POST and provide the query with `--field`:

`pnpm dlx gh-axi api POST graphql --field 'query=...'`

## Help

Use `pnpm dlx gh-axi --help` as the authority for available commands and global flags.
Use `pnpm dlx gh-axi <command> --help` for command-specific usage.

## Output and retries

- `gh-axi` uses TOON as its established selected output format.
  Do not change that format without explicit user or project approval.
- When output provides `full_log`, use that file instead of requesting the complete log again.
- Mutations are idempotent and report what changed or whether the requested state already exists.
- A failed mutation can be retried safely with the same arguments.
