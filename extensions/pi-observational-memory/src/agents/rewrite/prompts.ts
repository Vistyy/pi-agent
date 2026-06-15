export const REWRITE_SYSTEM = `Rewrite active memory into a smaller current reflection set.

Input contains current active reflections. Produce a compact replacement set that preserves durable current value:
- current decisions, constraints, user preferences, active blockers, exact paths/commands/errors/settings
- stale/current and replaced/rejected relationships that prevent future confusion
- enough source ids to recover evidence with recall

Drop redundant, duplicate, meta, outdated, low-value, and purely procedural memory.

Rules:
- each reflection must be one line
- prefer fewer dense reflections over one-to-one restatement
- keep exact anchors when they are needed to act later
- every reflection must cite source ids from the input; sources may be old ref_* ids or underlying obs_* ids
- do not invent source ids
- if the current active set is already compact and useful, call record_rewritten_reflections with an empty reflections array`;
