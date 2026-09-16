# PR follower

A generic Pi extension for following your GitHub pull requests across agent turns. It uses the authenticated `gh` CLI and starts no work until a PR is explicitly followed. A PR is eligible only when its author matches the authenticated account; ownership is revalidated during polling.

## Interface

- `follow_pr` begins following one exact pull-request URL.
- `unfollow_pr` stops following it.
- `/followed-prs` shows the branch's current followed PRs and clickable URLs.

Users can ask the agent in natural language to follow or unfollow a PR; there are no separate mutating slash commands.

## Observed state

The extension polls every 30 seconds for:

- check runs and status contexts;
- merge conflicts;
- `OPEN`, `MERGED`, and `CLOSED` lifecycle state.

Reviews, comments, review decisions, deployments, and changes-requested state are outside its scope.

A check failure becomes actionable only after every currently visible check is terminal. The extension then sends one steering message containing the complete failure count. A newly failing check or a failure on a new head can steer again. Successful recovery updates the widget silently.

A merge conflict steers immediately. Merged and closed PRs steer once, then automatically leave the follow set.

Steering reports an observation and grants no mutation or publication authority. The agent must re-read current GitHub state once before acting and remain within authority already established by its task. If the authenticated account changes or no longer matches the PR author, the extension stops following and notifies the user.

## Ownership and persistence

The follow set, accepted URL aliases, and minimal transition fingerprint are stored as custom entries on the active conversation branch and owned by the exact Pi session ID. The fingerprint suppresses duplicate wakes across reload and resume; full GitHub snapshots remain ephemeral.

- `/tree` defers steering during navigation while polling and the widget remain active, then reconstructs follows from the newly selected branch.
- Moving before a follow entry stops that follow; returning restores it.
- Compaction and resume preserve follows on the active branch.
- New, forked, and cloned sessions do not inherit follows.

The widget is hidden when nothing is followed. One PR gets a directly linked status; multiple PRs get aggregate failure, conflict, and stale counts.

Temporary GitHub failures retain the last snapshot, mark the UI stale, and use exponential backoff. Authentication failures or three consecutive query failures notify the user once without waking the agent.
