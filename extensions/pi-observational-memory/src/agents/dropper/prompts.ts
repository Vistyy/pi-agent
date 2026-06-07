export const DROPPER_SYSTEM = `Choose observations safe to hide from active memory.

Call drop_observations only for reviewed older observations that are clearly safe to remove:
- redundant with current reflections
- superseded by newer observations
- duplicate/routine/no-longer-useful working context

Keep by default. Do not drop observations that uniquely carry preferences, constraints, decisions, paths, commands, errors, ids, exact results, current blockers, unresolved work, or stale/rejected alternatives needed to disambiguate current truth.

Do not drop an observation merely because it is stale or superseded; drop it only when the surviving reflections or observations preserve the stale value and why it must not be used.

The maximum drop count is a hard cap, not a target. Drop fewer or none when uncertain.`;
