import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { runReflector } from "../agents/reflector/agent.js";
import type { Runtime } from "../runtime.js";
import {
	OM_OBSERVATIONS_RECORDED,
	OM_REFLECTIONS_RECORDED,
	buildReflectionsRecordedData,
	entryIndexById,
	foldLedger,
	latestCoverageMarkerId,
	type Entry,
	type Observation,
} from "../session-ledger/index.js";
import type { MemoryUpdateCtx, ReflectorStageResult, ResolveMemoryModel } from "./types.js";

function observationsSinceReflectionCoverage(entries: Entry[], observations: readonly Observation[]): Observation[] {
	const reflectionCoverageId = latestCoverageMarkerId(entries, OM_REFLECTIONS_RECORDED);
	const reflectionCoverageIdx = entryIndexById(entries).get(reflectionCoverageId ?? "") ?? -1;
	const idToIndex = entryIndexById(entries);
	return observations.filter((observation) =>
		observation.sourceEntryIds.some((sourceEntryId) => (idToIndex.get(sourceEntryId) ?? -1) > reflectionCoverageIdx)
	);
}

export async function runReflectorStage(
	pi: ExtensionAPI,
	runtime: Runtime,
	ctx: MemoryUpdateCtx,
	resolveModel: ResolveMemoryModel,
): Promise<ReflectorStageResult> {
	const entries = ctx.sessionManager.getBranch() as Entry[];
	const observationCoverageId = latestCoverageMarkerId(entries, OM_OBSERVATIONS_RECORDED);
	if (!observationCoverageId) return { outcome: "continue", sameRunReflections: [] };

	const folded = foldLedger(entries);
	const unreflectedObservations = observationsSinceReflectionCoverage(entries, folded.activeObservations);
	if (unreflectedObservations.length < runtime.config.reflectEveryObservations) return { outcome: "continue", sameRunReflections: [] };

	if (ctx.hasUI) ctx.ui?.notify(
		`Observational memory: reflector running (${unreflectedObservations.length.toLocaleString()} observations since reflection)`,
		"info",
	);
	const resolved = await resolveModel("reflector");
	if (!resolved) return { outcome: "abort", sameRunReflections: [] };

	const reflections = await runReflector({
		model: resolved.model as any,
		apiKey: resolved.apiKey,
		headers: resolved.headers,
		reflections: folded.reflections,
		observations: folded.activeObservations,
		maxTurns: runtime.config.agentMaxTurns,
		thinkingLevel: runtime.config.model?.thinking ?? "low",
	});
	if (!reflections) return { outcome: "continue", sameRunReflections: [] };

	const data = buildReflectionsRecordedData(reflections, observationCoverageId);
	if (!data) return { outcome: "continue", sameRunReflections: [] };
	pi.appendEntry(OM_REFLECTIONS_RECORDED, data);
	return {
		outcome: "continue",
		sameRunReflections: reflections,
		effectiveReflectionCoverageId: data.coversUpToId,
	};
}
