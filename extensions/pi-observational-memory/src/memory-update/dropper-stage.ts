import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { runDropper } from "../agents/dropper/agent.js";
import { observationPoolMetrics } from "../agents/dropper/pool.js";
import { debugLog } from "../debug-log.js";
import type { Runtime } from "../runtime.js";
import {
	OM_OBSERVATIONS_DROPPED,
	OM_OBSERVATIONS_RECORDED,
	buildObservationsDroppedData,
	earlierCoverageMarkerId,
	entryIndexById,
	foldLedger,
	latestCoverageMarkerId,
	latestReflectionReviewMarkerId,
	type Entry,
} from "../session-ledger/index.js";
import { commonAgentArgs } from "./stage-utils.js";
import type { MemoryUpdateCtx, ResolveMemoryModel, StageOutcome } from "./types.js";

export async function runDropperStage(
	pi: ExtensionAPI,
	runtime: Runtime,
	ctx: MemoryUpdateCtx,
	resolveModel: ResolveMemoryModel,
): Promise<StageOutcome> {
	const entries = ctx.sessionManager.getBranch() as Entry[];
	const observationCoverageId = latestCoverageMarkerId(entries, OM_OBSERVATIONS_RECORDED);
	const reflectionCoverageId = latestReflectionReviewMarkerId(entries);
	if (!observationCoverageId || !reflectionCoverageId) {
		debugLog("dropper.waiting_for_reflection", { hasObservationCoverage: Boolean(observationCoverageId), hasReflectionReviewCoverage: Boolean(reflectionCoverageId) });
		return "continue";
	}

	const folded = foldLedger(entries);
	const metrics = observationPoolMetrics(folded.activeObservations, runtime.config.dropWhenActiveObservationsOver);
	if (!metrics.ready) {
		debugLog("dropper.not_ready", {
			observationTokens: metrics.observationTokens,
			activeObservationCount: metrics.activeObservationCount,
			dropWhenActiveObservationsOver: metrics.dropWhenActiveObservationsOver,
			observationsOverTarget: metrics.observationsOverTarget,
			maxDropsAllowed: metrics.maxDropsAllowed,
		});
		return "continue";
	}
	debugLog("dropper.stage_start", {
		observationCoverageId,
		reflectionCoverageId,
		reflectionCount: folded.reflections.length,
		protectRecentObservations: runtime.config.protectRecentObservations,
		activeObservationCount: metrics.activeObservationCount,
		dropWhenActiveObservationsOver: metrics.dropWhenActiveObservationsOver,
		observationsOverTarget: metrics.observationsOverTarget,
		observationTokens: metrics.observationTokens,
		maxDropsAllowed: metrics.maxDropsAllowed,
	});

	if (ctx.hasUI) ctx.ui?.notify(
		`Observational memory: dropper running — active observations ${metrics.activeObservationCount.toLocaleString()} / ${metrics.dropWhenActiveObservationsOver.toLocaleString()} limit`,
		"info",
	);
	const resolved = await resolveModel("dropper");
	if (!resolved) return "abort";

	const idToIndex = entryIndexById(entries);
	const reflectionCoverageIndex = idToIndex.get(reflectionCoverageId) ?? -1;
	const recentProtectedIds = new Set(folded.activeObservations.slice(-runtime.config.protectRecentObservations).map((observation) => observation.id));
	const protectedObservationIds = folded.activeObservations
		.filter((observation) => recentProtectedIds.has(observation.id)
			|| observation.sourceEntryIds.some((sourceEntryId) => (idToIndex.get(sourceEntryId) ?? -1) > reflectionCoverageIndex))
		.map((observation) => observation.id);

	const droppedIds = await runDropper({
		...commonAgentArgs(runtime, resolved),
		reflections: folded.reflections,
		observations: folded.activeObservations,
		maxDropsAllowed: metrics.maxDropsAllowed,
		protectedObservationIds,
	});
	const coversUpToId = earlierCoverageMarkerId(entries, observationCoverageId, reflectionCoverageId);
	const data = coversUpToId && droppedIds ? buildObservationsDroppedData(droppedIds, coversUpToId) : undefined;
	debugLog("dropper.append", {
		droppedIdsCount: droppedIds?.length ?? 0,
		coversUpToId,
		dataBuilt: data !== undefined,
		appended: data !== undefined,
	});
	if (data) pi.appendEntry(OM_OBSERVATIONS_DROPPED, data);
	return "continue";
}
