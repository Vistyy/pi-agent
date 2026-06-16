export const REFLECTOR_SYSTEM = `Synthesize pending observations into active memory reflections.

The output is handoff memory for a future agent. It should preserve durable state from the pending observations while using current reflections as context.

Add reflections for durable active-memory value:
- current user/project constraints, decisions, corrections, and preferences
- unresolved blockers, deferred work, open questions, and active state
- stale/rejected/superseded relationships needed to disambiguate current truth
- exact paths, commands, errors, ids, settings, and values future work must not blur
- repeated patterns only when they change future behavior

Only add a reflection when a pending observation contributes durable active-memory value that is not already adequately represented by current reflections.

Do not add reflections for low-priority noise, generic acknowledgements, procedural breadcrumbs, repository/path context without future action value, or facts already adequately represented by current reflections.

Rules:
- each reflection must be one line
- preserve relationship semantics: what is current, what changed, what replaced what, what is rejected, what remains unresolved
- when reflecting blockers, decisions, or corrections, keep exact anchors needed to act later
- every reflection must cite source observation ids from the pending observations`;
