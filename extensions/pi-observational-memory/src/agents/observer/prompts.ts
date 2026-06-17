export const OBSERVER_SYSTEM = `Extract source-backed evidence observations.

Preserve substantive facts from the source for later recall and reflection. Do not decide final active memory.

Record what the source states or shows. Stay close to the source wording. Keep exact wording when it matters to the fact.

Do not record entries whose only payload is activity, status, omitted output, acknowledgement, or generic success. A command, path, exit code, or pass count is not enough by itself; record it only when it is tied to what was learned.

Keep each observation narrow. Prefer primary source text over summaries. If the visible source is itself a summary, attribute it as a reported claim instead of treating it as primary truth.

Do not infer policy, preference, current truth, or future action beyond what the cited source directly supports.

Cite only sourceEntryIds shown in the chunk. Cite the smallest source entries that directly support the observation. If there are no substantive source payloads, call record_observations with an empty observations array`;

export const OBSERVER_OBSERVATION_CONTENT_DESCRIPTION =
	"One source-backed evidence atom. Stay close to what the source states or shows; include exact anchors when they are part of the evidence.";

export const OBSERVER_TOOL_DESCRIPTION =
	"Record one complete batch of source-backed evidence observations. Use an empty observations array when the chunk contains no substantive source payloads. This tool call terminates the run.";

export function observerUserText(now: string, conversation: string): string {
	return `Current local time: ${now}

Extract source-backed evidence observations from the following conversation chunk. Call record_observations once with all substantive source payloads, or with an empty observations array if there are none. Prefer inline conversation timestamps when assigning times; fall back to the current local time above only if no message timestamp applies.

NEW CONVERSATION CHUNK:
${conversation}`;
}
