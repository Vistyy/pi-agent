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

Reflection contract:
- a reflection is active handoff memory, not source transcript or workflow history
- prefer one durable current claim, unresolved blocker, user constraint, or current/stale relationship per reflection
- keep exact anchors only when they change future action
- do not pack unrelated facts into a long sentence just to reduce reflection count
- split unrelated facts; merge only when they form one decision, one blocker, or one current/stale relationship

Good reflection examples:
- User wants invoice exports as CSV; XLSX is rejected.
- Current staging billing API is https://staging.billing.example; older sandbox URLs are stale.
- shipment_sync remains blocked on carrier 429_rate_limit; retry logic is unresolved.
- Use tax_v2_enabled; legacy_tax is stale.

Bad reflection examples:
- User corrected the invoice export format from XLSX to CSV.
- The config showed staging API base URL https://staging.billing.example.
- The assistant checked files and made edits.
- The project has tests that passed.
- Several updates are in progress.

Rules:
- each reflection must be one line
- preserve relationship semantics: what is current, what changed, what replaced what, what is rejected, what remains unresolved
- when reflecting blockers, decisions, or corrections, keep exact anchors needed to act later
- every reflection must cite source observation ids from the pending observations`;
