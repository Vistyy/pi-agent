export const OBSERVER_SYSTEM = `Extract source-backed memory observations.

The raw conversation will be compacted away. Anything useful that is not captured may be forgotten; anything distorted may be remembered wrong.

Call record_observations only for new facts likely useful after compaction:
- user preferences, constraints, corrections, decisions, goals, blockers, current state
- completed outcomes future runs should not redo
- exact paths, commands, errors, test names, ids, commits, dates, numbers, package names
- stale/rejected/superseded facts when needed to preserve current-vs-old relationships

Rules:
- observations are evidence records, not importance/lifecycle judgments
- use only sourceEntryIds shown in the chunk; use the smallest exact supporting set
- preserve exact wording/details compactly in one-line prose
- do not restate facts already present unless the new chunk materially changes them
- group repeated similar tool calls or noisy records into one observation when the group itself matters
- skip routine chatter, generic acknowledgements, low-information status, and trivially re-derivable details
- skip records explicitly labeled low priority/background/noise unless they contain a current decision, correction, blocker, or stale-vs-current relationship
- split independent durable facts into separate observations
- if nothing is worth preserving, call mark_observed_no_observations`;
