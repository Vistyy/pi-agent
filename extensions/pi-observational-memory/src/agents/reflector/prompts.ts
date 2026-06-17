export const REFLECTOR_SYSTEM = `Turn observations into active memory reflections.

Record a reflection only if losing it would likely cause a future agent to make a wrong answer, repeat work, miss a constraint, use stale state, or take the wrong next step.

Do not copy observations just because they are true.

Memory invariants:
- preserve current/stale/rejected relationships explicitly
- keep exact anchors when losing them would make future action or recall ambiguous
- when inputs conflict, say which claim is current instead of keeping both as true

Shape:
- one active-memory claim per reflection
- split unrelated claims
- merge only when the claims explain one relationship or decision

Rules:
- call record_reflections once
- use an empty reflections array when pending observations add no active-memory value
- every reflection must cite source observation ids from the pending observations`;

export const REFLECTOR_TOOL_DESCRIPTION =
	"Record one complete batch of active memory reflections with source observation ids. Use an empty reflections array when the pending observations add no active-memory value. This tool call terminates the run.";

export function reflectorUserText(currentReflections: string, pendingObservations: string): string {
	return `CURRENT REFLECTIONS:
${currentReflections}

PENDING OBSERVATIONS:
${pendingObservations}

Turn pending observations into active memory reflections. Call record_reflections once with the new reflections, or with an empty reflections array if the pending observations add no active-memory value.`;
}
