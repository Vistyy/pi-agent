# Pull-request following

A generic Pi extension for recurring observation of your GitHub pull requests across agent turns. It requires the authenticated `gh` CLI and starts no work until the agent explicitly calls `follow_pr` for a pull request authored by that account.

## Interface

- `follow_pr` begins following one exact pull-request URL.
- `unfollow_pr` stops following it.
- `/followed-prs` shows the current branch's followed pull requests and clickable URLs.

Users can ask the agent to follow or unfollow a pull request in natural language. There are no separate mutating slash commands.

## Scope

Every 30 seconds, the extension checks:

- check runs and status contexts;
- merge conflicts; and
- `OPEN`, `MERGED`, or `CLOSED` lifecycle state.

It does not observe reviews, comments, review decisions, deployments, or changes-requested state.

## Delivered observations

| Observed change | Result |
| --- | --- |
| One or more checks fail after every visible check becomes terminal | Steer once with the complete failure count. |
| A new check fails, or the same failure appears on a new head | Steer again. |
| Failed checks recover | Update the widget without steering. |
| The pull request becomes conflicting | Steer immediately. |
| The pull request becomes merged or closed | Steer once, then stop following it. |

The extension revalidates authorship while following. If the authenticated account changes or no longer matches the pull-request author, it stops following and notifies the user.

A delivered observation grants no mutation or publication authority. Before acting, the agent must:

1. re-read current GitHub state once; and
2. remain within the authority explicitly granted by the user for the current work.

## Branch persistence

The active conversation branch stores:

- the follow set;
- accepted URL aliases; and
- a minimal transition fingerprint keyed by exact Pi session ID.

The fingerprint suppresses duplicate steering across reload and resume. Full GitHub snapshots remain ephemeral.

| Branch event | Effect |
| --- | --- |
| Open `/tree` navigation | Defer steering while observation and the widget remain active. |
| Select another branch | Reconstruct follows from that branch. |
| Move before a follow entry | Stop that follow until returning past the entry. |
| Compact or resume | Preserve follows from the active branch. |
| Create, fork, or clone a session | Do not inherit follows. |

## UI and failures

The widget is hidden when nothing is followed. One followed pull request gets a direct link and status; multiple pull requests get aggregate failure, conflict, and stale counts.

Temporary GitHub failures retain the last snapshot, mark the UI stale, and use exponential backoff. A missing `gh` CLI, authentication failure, or three consecutive query failures notifies the user once without waking the agent.

The agent is not expected to poll independently for observation recovery. A later delivered observation or user message can resume the pull-request work.
