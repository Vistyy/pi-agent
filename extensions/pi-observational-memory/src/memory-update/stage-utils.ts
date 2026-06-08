import type { Runtime } from "../runtime.js";
import { entryIndexById, latestReflectionReviewMarkerId, type Entry, type Observation } from "../session-ledger/index.js";
import type { ModelThinkingLevel } from "@earendil-works/pi-ai";
import type { ResolvedModel } from "./types.js";

export function commonAgentArgs(runtime: Runtime, resolved: ResolvedModel, thinkingOverride?: ModelThinkingLevel) {
	return {
		model: resolved.model as any,
		apiKey: resolved.apiKey,
		headers: resolved.headers,
		maxTurns: runtime.config.agentMaxTurns,
		thinkingLevel: thinkingOverride ?? runtime.config.model?.thinking ?? "low",
	};
}

export function observationsSinceReflectionCoverage(entries: Entry[], observations: readonly Observation[]): Observation[] {
	const reflectionCoverageId = latestReflectionReviewMarkerId(entries);
	const reflectionCoverageIdx = entryIndexById(entries).get(reflectionCoverageId ?? "") ?? -1;
	const idToIndex = entryIndexById(entries);
	return observations.filter((observation) =>
		observation.sourceEntryIds.some((sourceEntryId) => (idToIndex.get(sourceEntryId) ?? -1) > reflectionCoverageIdx)
	);
}
