import type { Runtime } from "../runtime.js";
import { entryIndexById, latestCoverageMarkerId, OM_REFLECTIONS_RECORDED, type Entry, type Observation } from "../session-ledger/index.js";
import type { ResolvedModel } from "./types.js";

export function commonAgentArgs(runtime: Runtime, resolved: ResolvedModel) {
	return {
		model: resolved.model as any,
		apiKey: resolved.apiKey,
		headers: resolved.headers,
		maxTurns: runtime.config.agentMaxTurns,
		thinkingLevel: runtime.config.model?.thinking ?? "low",
	};
}

export function observationsSinceReflectionCoverage(entries: Entry[], observations: readonly Observation[]): Observation[] {
	const reflectionCoverageId = latestCoverageMarkerId(entries, OM_REFLECTIONS_RECORDED);
	const reflectionCoverageIdx = entryIndexById(entries).get(reflectionCoverageId ?? "") ?? -1;
	const idToIndex = entryIndexById(entries);
	return observations.filter((observation) =>
		observation.sourceEntryIds.some((sourceEntryId) => (idToIndex.get(sourceEntryId) ?? -1) > reflectionCoverageIdx)
	);
}
