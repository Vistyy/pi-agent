import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { Runtime } from "../runtime.js";
import { OM_AGENT_USAGE_RECORDED, buildAgentUsageRecordedData, entryIndexById, latestReflectionReviewMarkerId, type Entry, type Observation } from "../session-ledger/index.js";
import type { ModelThinkingLevel } from "@earendil-works/pi-ai";
import type { MemoryAgentUsage } from "../agents/common.js";
import type { ResolvedModel } from "./types.js";

export function commonAgentArgs(pi: ExtensionAPI, runtime: Runtime, resolved: ResolvedModel, thinkingOverride?: ModelThinkingLevel) {
	return {
		model: resolved.model as any,
		apiKey: resolved.apiKey,
		headers: resolved.headers,
		maxTurns: runtime.config.agentMaxTurns,
		thinkingLevel: thinkingOverride ?? runtime.config.model?.thinking ?? "low",
		onUsage: (usage: MemoryAgentUsage) => {
			pi.appendEntry(OM_AGENT_USAGE_RECORDED, buildAgentUsageRecordedData({ ...usage, agent: usage.agent ?? "unknown" }));
		},
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
