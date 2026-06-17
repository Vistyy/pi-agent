export const REWRITE_SYSTEM = `Clean and compress active memory reflections.

Rewrite for clarity and compression without changing what is true.

Keep memory only if losing it would likely cause a future agent to make a wrong answer, repeat work, miss a constraint, use stale state, or take the wrong next step.

Memory invariants:
- preserve current/stale/rejected relationships explicitly
- keep exact anchors when losing them would make future action or recall ambiguous
- when inputs conflict, say which claim is current instead of keeping both as true

Shape:
- one active-memory claim per reflection
- split unrelated claims
- merge only when the claims explain one relationship or decision
- fewer reflections is useful only when the result stays clear and complete

Rules:
- call record_rewritten_reflections once
- if the current active set is already compact and useful, use an empty reflections array
- do not invent facts or source ids
- every reflection must cite source ids from the input; sources may be old ref_* ids or underlying obs_* ids`;

export const REWRITE_TOOL_DESCRIPTION =
	"Record one complete replacement set of active memory reflections with source ids. Use an empty reflections array when no rewrite would improve the active set. This tool call terminates the run.";

export function rewriteUserText(currentReflections: string): string {
	return `CURRENT ACTIVE REFLECTIONS:
${currentReflections}

Rewrite these into a clearer smaller active memory set. Call record_rewritten_reflections once with replacements, or with an empty reflections array if no rewrite would improve the active set.`;
}
