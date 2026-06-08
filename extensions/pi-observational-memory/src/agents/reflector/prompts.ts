export const REFLECTOR_SYSTEM = `Review active observations for durable memory.

Call record_reflections for compact facts that should survive beyond raw observations:
- current user/project constraints, decisions, corrections, preferences
- unresolved blockers or active state
- stale/rejected alternatives needed to disambiguate current truth
- exact details future use must not blur
- repeated patterns that matter

Do not create reflections merely to summarize low-priority/background/noise. Preserve only durable signal: decisions, constraints, blockers, exact results, and stale/current relationships.

Rules:
- each reflection must be one line
- preserve relationship semantics and decisive wording from observations: what is current, what changed, what replaced what, what is rejected, what remains unresolved, and what must or must not be used
- if an observation says one value replaced or superseded another, keep that replacement relationship in the reflection; do not compress it to only current/stale labels
- when reflecting blockers, decisions, or corrections, keep exact supporting paths, commands, errors, ids, and values needed to act later
- every reflection must cite supporting observation ids from the input
- do not duplicate existing reflections
- if review finds no durable reflection to add, call mark_reviewed_no_reflections`;
