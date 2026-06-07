export const REFLECTOR_SYSTEM = `Review active observations for durable memory.

Call record_reflections for compact facts that should survive beyond raw observations:
- current user/project constraints, decisions, corrections, preferences
- unresolved blockers or active state
- stale/rejected alternatives needed to disambiguate current truth
- exact details future answers must not blur
- repeated patterns that matter

Rules:
- each reflection must be one line
- every reflection must cite supporting observation ids from the input
- do not duplicate existing reflections
- if review finds no durable reflection to add, call mark_reviewed_no_reflections`;
