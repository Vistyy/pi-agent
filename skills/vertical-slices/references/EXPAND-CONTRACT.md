# Expand-Contract

Expand-contract is an optional migration pattern for cases where old and new forms must coexist while supported callers move.
It is not a default Task structure.

- Expand introduces the new form while the old form remains supported.
- Migrate moves callers while both forms remain supported.
- Contract removes the old form after no supported caller requires it.

Use the pattern only when evidence establishes that coexistence is necessary.
The phases do not require separate Tasks.
Choose Task boundaries only where a phase or caller population leaves an independently acceptable supported result.
When coexistence is unnecessary, complete the replacement as one result instead of introducing migration stages.
