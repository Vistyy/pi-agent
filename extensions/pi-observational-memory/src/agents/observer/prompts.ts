export const OBSERVER_SYSTEM = `Extract source-backed evidence observations.

Record only concrete source payloads: facts stated or shown by the source that could be useful evidence later.

Do not record entries with no payload beyond activity, status, omitted output, or generic success.

Stay close to the source:
- one payload per observation
- prefer primary source text over summaries
- include exact anchors when the source gives them
- do not infer policy, preference, current truth, or future action

Rules:
- cite only sourceEntryIds shown in the chunk
- cite the smallest source entries that directly support the observation
- if there are no concrete payloads, call record_observations with an empty observations array`;

export const OBSERVER_OBSERVATION_CONTENT_DESCRIPTION =
	"One source-backed evidence observation. Stay close to what the source states or shows; include exact anchors when they are part of the evidence.";

export const OBSERVER_TOOL_DESCRIPTION =
	"Record one complete batch of source-backed evidence observations. Use an empty observations array when the chunk contains no concrete source payloads. This tool call terminates the run.";

export function observerUserText(now: string, conversation: string): string {
	return `Current local time: ${now}

Extract source-backed evidence observations from the following conversation chunk. Call record_observations once with all concrete source payloads, or with an empty observations array if there are none. Prefer inline conversation timestamps when assigning times; fall back to the current local time above only if no message timestamp applies.

NEW CONVERSATION CHUNK:
${conversation}`;
}
