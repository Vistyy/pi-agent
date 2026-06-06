import { estimateStringTokens } from "../tokens.js";
import type { Observation, Reflection } from "./types.js";

export type MemoryPatchOptions = {
	maxTokens: number;
};

function observationPriority(observation: Observation): number {
	if (observation.relevance === "critical") return 0;
	if (observation.relevance === "high") return 1;
	if (observation.event?.status && /unresolved|blocked|rejected|current|completed|confirmed/i.test(observation.event.status)) return 2;
	return 3;
}

function isPatchWorthy(observation: Observation): boolean {
	if (observation.relevance === "critical" || observation.relevance === "high") return true;
	if (observation.event?.details.some((detail) => /\/|\b[A-Z]{2,}\d+\b|\berror\b|\bfailed\b|\bpassed\b|\bnpm\b|\bgit\b|\bcommit\b|\bdecision\b|\brejected\b|\bblocked\b|\bunresolved\b|\d/.test(detail))) return true;
	return false;
}

function observationPatchBlock(observation: Observation): string {
	if (observation.event) {
		const header = `[${observation.id}] ${observation.timestamp} [${observation.relevance}] ${observation.event.title}`;
		const details = observation.event.details.map((detail) => `  - ${detail}`);
		const status = observation.event.status ? [`  status: ${observation.event.status}`] : [];
		return [header, ...details, ...status].join("\n");
	}
	return `[${observation.id}] ${observation.timestamp} [${observation.relevance}] ${observation.content}`;
}

function reflectionPatchBlock(reflection: Reflection): string {
	return `[${reflection.id}] ${reflection.content}`;
}

const PATCH_HEADER = "## Observational memory exact-detail patch";
const PATCH_INSTRUCTIONS = "Use this only for exact prior-session details that may be missing or blurred in the compacted summary. Use recall(id) when source evidence is needed.";

export function renderMemoryPatch(
	reflections: readonly Reflection[],
	observations: readonly Observation[],
	options: MemoryPatchOptions,
): string {
	if (options.maxTokens <= 0) return "";
	const blocks: string[] = [];
	let tokens = estimateStringTokens([PATCH_HEADER, PATCH_INSTRUCTIONS].join("\n"));

	const sortedObservations = observations
		.filter(isPatchWorthy)
		.sort((a: Observation, b: Observation) => observationPriority(a) - observationPriority(b) || a.timestamp.localeCompare(b.timestamp));

	for (const observation of sortedObservations) {
		const block = observationPatchBlock(observation);
		const blockTokens = estimateStringTokens(block);
		if (tokens + blockTokens > options.maxTokens) continue;
		blocks.push(block);
		tokens += blockTokens;
	}

	const reflectionBlocks: string[] = [];
	for (const reflection of reflections) {
		const block = reflectionPatchBlock(reflection);
		const blockTokens = estimateStringTokens(block);
		if (tokens + blockTokens > options.maxTokens) continue;
		reflectionBlocks.push(block);
		tokens += blockTokens;
	}

	if (blocks.length === 0 && reflectionBlocks.length === 0) return "";
	return [
		PATCH_HEADER,
		PATCH_INSTRUCTIONS,
		...(blocks.length ? ["\n### Observations", blocks.join("\n")] : []),
		...(reflectionBlocks.length ? ["\n### Reflections", reflectionBlocks.join("\n")] : []),
	].join("\n");
}
