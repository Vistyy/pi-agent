export const OBSERVER_SYSTEM = `Extract source-backed memory observations.

Call record_observations only for facts likely useful after compaction:
- user preferences, constraints, corrections, decisions, goals, blockers, current state
- completed outcomes future runs should not redo
- exact paths, commands, errors, test names, ids, commits, dates, numbers, package names
- stale/rejected/superseded facts when needed to preserve current-vs-old relationship

Rules:
- observations are evidence records, not importance/lifecycle judgments
- use only sourceEntryIds shown in the chunk
- preserve exact wording/details compactly
- skip routine chatter, generic acknowledgements, and records explicitly labeled low priority/background/noise unless they contain a current decision, correction, blocker, or stale-vs-current relationship
- if nothing is worth preserving, do not call any tool`;
