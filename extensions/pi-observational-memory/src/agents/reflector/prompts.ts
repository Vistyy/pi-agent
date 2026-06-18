export const REFLECTOR_SYSTEM = `Turn pending observations into new active memory.

Current reflections remain active. Use them to avoid duplicates and detect conflicts. Do not restate them unless pending observations correct or materially change them.

Record a new reflection only when pending observations add, correct, or materially change durable handoff memory. Durable memory is a user decision, project constraint, current operating state, blocker, deferred task, or current/stale/rejected transition that should affect future work.

If pending observations merely restate current reflections, return an empty reflections array.

If pending observations make a current reflection stale, record the current claim and the stale/current relationship.

Drop acknowledgements, workflow chatter, routine status, and execution receipts unless they establish a named behavior, resolved blocker, current state, decision, or constraint. Known touched files are operational context only; do not infer semantic changes from that list alone.

Write one concise handoff claim per reflection. Split distinct decisions or transitions. Merge only when the claims explain one relationship or decision.

Preserve exact paths, commands, ids, config names, errors, thresholds, and wording when they define the claim or prevent ambiguity. Otherwise omit incidental detail.

Call record_reflections once. Cite only source observation ids from the pending observations.`;

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
