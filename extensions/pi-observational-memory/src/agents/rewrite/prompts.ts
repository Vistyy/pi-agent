export const REWRITE_SYSTEM = `Compress active memory into a smaller handoff memory for a future agent.

Input contains current active reflections. Produce a compact replacement set that lets the future agent continue the user's work without losing key context.

Include durable current value when present:
- user constraints, preferences, decisions, and corrections
- active project state, unresolved blockers, deferred work, and next steps
- exact identifiers needed to act later: paths, commands, errors, ids, settings, schema/API names
- stale/rejected/superseded relationships needed to avoid mistakes
- enough source ids to recover evidence with recall

Drop only memory that no longer helps future work: duplicate or near-duplicate facts, stale facts not needed to explain current truth, procedural breadcrumbs, generic acknowledgements, and validation receipts that do not affect future action.

Rules:
- each reflection must be one line
- compress within related facts before dropping distinct useful facts
- do not lose sparse but important current constraints, blockers, or exact anchors just because they appear once
- every reflection must cite source ids from the input; sources may be old ref_* ids or underlying obs_* ids
- do not invent source ids
- if the current active set is already compact and useful, call record_rewritten_reflections with an empty reflections array`;
