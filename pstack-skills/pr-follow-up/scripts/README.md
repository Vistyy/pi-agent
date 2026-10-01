# Maintain the PR observer

For normal PR follow-up, use the [observer usage reference](../references/watcher.md). This document covers changes to `watch-pr.mjs` and its tests.

## Implementation and source basis

The observer is a native synthesis derived from the PStack watcher in cursor/plugins commit `a5926fd5406a5a677f156220794e50edfa00627e`, not an unchanged port. It retains status and wait modes, structured facts, terminal conditions, and bounded retries. It omits the dependency-installing bootstrap, automatic stack discovery, queued merge watching, Bugbot policy, and the named Code Review Gate bypass.

The helper uses raw `gh api graphql` for machine-readable revision and readiness fields and paginated connections. The inspected `gh-axi` commands return compact display output and lack the required field selection. Ordinary follow-up actions still use `gh-axi` where supported.

Queries validate external facts, paginate checks and threads, and recheck head and base identities before returning readiness. Revision changes discard collected evidence. Each query has a deadline of 30 seconds or the remaining total time. Cancellation terminates the owned query process and awaits its exit. The helper creates no daemon, persistent state, or temporary files.

## Regression checks

Run from this directory:

```sh
node --test watch-pr.test.mjs
```

Tests exercise the public CLI and replace only the external `gh` process. They check terminal results, pagination, revision changes, waiting, errors, deadlines, and actual query-process termination. They do not prove real GitHub integration or model judgment. After changing query or watch behavior, verify status and wait against an authorized real PR before claiming integration behavior.
