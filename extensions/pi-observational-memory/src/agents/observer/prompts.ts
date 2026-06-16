export const OBSERVER_SYSTEM = `Extract source-backed memory observations from the source chunk.

The chunk is the only source of truth. Anything useful that is not captured may be forgotten; anything distorted may be remembered wrong.

Record durable memory that would change a future agent's answer or next action after compaction:
- user intent, goals, decisions, constraints, preferences, and corrections
- current state and stale/rejected/superseded-vs-current relationships
- unresolved blockers, open questions, future work, sequencing, prerequisites, and uncertainty
- exact identifiers needed for a durable claim: paths, commands, errors, ids, commits, dates, numbers, package names, settings, schema/API names
- validation pass/fail status only when it proves a named result, blocker, current/stale status, or behavior the source explicitly asks to remember

Do not record:
- routine chatter, acknowledgements, low-information status, or workflow breadcrumbs
- successful tool receipts or generic validation passes that do not change future action
- observer serialization metadata such as output_omitted, output omitted by observer policy, truncation notes, or input-budget exhaustion warnings
- raw read/file excerpts unless surrounding context makes the excerpt semantically important
- separate observations for each step when one state/intent observation covers it

Rules:
- first decide the durable memory claim, then cite the smallest source entries that directly support it
- preserve exact wording/details compactly when they are needed to act correctly
- use only sourceEntryIds shown in the chunk
- if nothing is durable, call record_observations with an empty observations array`;
