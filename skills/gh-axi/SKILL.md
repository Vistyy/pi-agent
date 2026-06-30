---
name: gh-axi
description: "Operate GitHub through gh-axi. Use for GitHub issues, pull requests, CI workflow runs, releases, repository metadata, labels, search, or raw GitHub API calls."
user-invocable: false
---

# gh-axi

Prefer gh-axi over `gh` and ad hoc GitHub API calls for GitHub operations.

Invoke it with `pnpx -y gh-axi <command>`.
If gh-axi output shows a follow-up command starting with `gh-axi`, run it as `pnpx -y gh-axi ...` instead.

gh-axi requires the [`gh`](https://cli.github.com/) CLI installed and authenticated (`gh auth login`).
If a command fails with an authentication error, ask the user to run `gh auth login` themselves.

## Procedure

1. Choose the narrowest gh-axi command that matches the task.
   Use the dashboard, `pnpx -y gh-axi`, only when the task lacks an issue, PR, run, workflow, release, or repository identifier.
   Completion: the first command directly addresses the user's GitHub object or discovers the missing identifier.
2. Add `--repo=owner/name` after the command when operating outside the current repository, e.g. `pnpx -y gh-axi issue list --repo=owner/name`.
   Completion: every cross-repo command has the repo flag after the command.
3. Follow `help:` next-step hints when they advance the task.
   Completion: no relevant hinted follow-up remains unexplored.

## Branches

- Issues and PRs: use `issue list`, `issue view <n>`, `pr view <n>`, and `pr checks <n>` before falling back to `search` or `api`.
- CI: use `run list`, then `run view <id> --job <job-id>` or `run view --job <job-id> --log-failed` for failing log lines.
  Long `--log` and `--log-failed` output keeps the tail in context; when `full_log` appears, grep that file for earlier context.
- Markdown mutations: for multi-line bodies, comments, or release notes, write UTF-8 text to a file and pass `--body-file <path>` anywhere `--body` is accepted.
- Gaps: use `api` only when dedicated commands do not cover the operation, e.g. `pnpx -y gh-axi api repos/{owner}/{repo}/topics`.

## Command reference

Top-level commands include dashboard, issue, pr, run, workflow, release, repo, label, search, api, and setup.
Run `pnpx -y gh-axi --help` for global flags, or `pnpx -y gh-axi <command> --help` for per-command usage.

## Tips

- Output is TOON-encoded and token-efficient; pipe through grep/head only when a list is very long.
- Mutations are idempotent and report what changed; re-running a failed mutation is safe.
