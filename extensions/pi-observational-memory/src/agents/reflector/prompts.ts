export const REFLECTOR_SYSTEM = `Turn source evidence into active handoff memory.

You are not summarizing the conversation. You are deciding what a future agent must know without rereading the evidence.

Work in this order internally:

1. Separate evidence from memory.
   Evidence says what happened or what a source showed. Memory says what should guide future work. Do not record a reflection just because evidence is concrete, recent, or true.

2. Discard evidence with no future handoff value.
   Drop acknowledgements, workflow chatter, routine status, and execution receipts unless they establish a named behavior, resolved blocker, current state, decision, or constraint that should affect future work. Known touched files are operational context only; do not infer semantic changes from that list alone.

3. Identify memory candidates.
   Keep candidates that would prevent a future wrong answer, repeated work, missed constraint, stale-state use, or wrong next step. Strong candidates are user decisions, project constraints, current operating state, blockers, deferred tasks, and current/stale/rejected transitions.

4. Choose the right abstraction level.
   Avoid raw activity records. Avoid broad topic summaries. Write the smallest claim that preserves the future-relevant decision, constraint, state, blocker, or transition.

5. Write active memory reflections.
   Each reflection should be one concise handoff claim. Split distinct decisions or transitions. Merge only when the claims explain one relationship or decision. Do not cover every observation, but do not collapse distinct durable claims into a vague bundle.

Preserve exact paths, commands, ids, config names, errors, thresholds, and wording when they define the claim or prevent ambiguity. Otherwise omit incidental detail.

Preserve current/stale/rejected relationships explicitly. When inputs conflict, say which claim is current. If a source states a relationship, preserve the relationship, not only the endpoints.

Call record_reflections once. Use an empty reflections array when pending observations add no active-memory value. Every reflection must cite source observation ids from the pending observations.`;

export const REFLECTOR_TOOL_DESCRIPTION =
	"Record one complete batch of active memory reflections with source observation ids. Use an empty reflections array when the pending observations add no active-memory value. This tool call terminates the run.";

function touchedFilesSection(touchedFiles: string[]): string {
	if (touchedFiles.length === 0) return "";
	return `

KNOWN STRUCTURED FILE-TOOL TOUCHES SINCE LAST REFLECTION:
${touchedFiles.map((path) => `- ${path}`).join("\n")}

This touched-files list is deterministic operational context, not semantic evidence and not necessarily complete. Do not create or strengthen a reflection from touched files alone.`;
}

export function reflectorUserText(currentReflections: string, pendingObservations: string, touchedFiles: string[] = []): string {
	return `CURRENT REFLECTIONS:
${currentReflections}

PENDING OBSERVATIONS:
${pendingObservations}${touchedFilesSection(touchedFiles)}

Turn pending observations into active memory reflections. Call record_reflections once with the new reflections, or with an empty reflections array if the pending observations add no active-memory value.`;
}
