import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { runDropper } from "../agents/dropper/agent.js";
import { observationPoolMetrics } from "../agents/dropper/pool.js";
import { debugLog } from "../debug-log.js";
import type { Runtime } from "../runtime.js";
import {
	OM_OBSERVATIONS_DROPPED,
	OM_OBSERVATIONS_RECORDED,
	OM_REFLECTIONS_RECORDED,
	buildObservationsDroppedData,
	earlierCoverageMarkerId,
	foldLedger,
	latestCoverageMarkerId,
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
	const reflectionCoverageId = latestCoverageMarkerId(entries, OM_REFLECTIONS_RECORDED);
	if (!observationCoverageId || !reflectionCoverageId) {
		debugLog("dropper.waiting_for_reflection", { hasObservationCoverage: Boolean(observationCoverageId), hasReflectionCoverage: Boolean(reflectionCoverageId) });
		return "continue";
	}

	const folded = foldLedger(entries);
	if (folded.reflections.length === 0) {
		debugLog("dropper.waiting_for_reflection", { reflectionCount: 0 });
		return "continue";
	}
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

	const droppedIds = await runDropper({
		...commonAgentArgs(runtime, resolved),
		reflections: folded.reflections,
		observations: folded.activeObservations,
		maxDropsAllowed: metrics.maxDropsAllowed,
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
