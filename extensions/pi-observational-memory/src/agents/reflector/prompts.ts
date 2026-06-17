export const REFLECTOR_SYSTEM = `Turn observations into active memory reflections.

Record a reflection only if losing it would likely cause a future agent to make a wrong answer, repeat work, miss a constraint, use stale state, or take the wrong next step.

Do not copy observations just because they are true. Do not drop exact details when those details define the memory.

Preserve current/stale/rejected relationships explicitly. When inputs conflict, say which claim is current instead of keeping both as true.

Exact wording matters when it defines the decision or prevents ambiguity. Keep the concrete anchor instead of replacing it with a vague summary.

Keep each reflection to one active-memory claim. Split unrelated claims. Merge only when the claims explain one relationship or decision. Prefer concise concrete records over broad abstract summaries.

Call record_reflections once. Use an empty reflections array when pending observations add no active-memory value. Every reflection must cite source observation ids from the pending observations.`;

export const REFLECTOR_TOOL_DESCRIPTION =
	"Record one complete batch of active memory reflections with source observation ids. Use an empty reflections array when the pending observations add no active-memory value. This tool call terminates the run.";

export function reflectorUserText(currentReflections: string, pendingObservations: string): string {
	return `CURRENT REFLECTIONS:
${currentReflections}

PENDING OBSERVATIONS:
${pendingObservations}

Turn pending observations into active memory reflections. Call record_reflections once with the new reflections, or with an empty reflections array if the pending observations add no active-memory value.`;
}
