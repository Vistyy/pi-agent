import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { runReflector } from "../agents/reflector/agent.js";
import { debugLog } from "../debug-log.js";
import type { Runtime } from "../runtime.js";
import {
	OM_OBSERVATIONS_RECORDED,
	OM_REFLECTIONS_RECORDED,
	OM_REFLECTIONS_REVIEWED,
	buildReflectionsRecordedData,
	buildReflectionsReviewedData,
	foldLedger,
	latestCoverageMarkerId,
	type Entry,
} from "../session-ledger/index.js";
import { commonAgentArgs, observationsSinceReflectionCoverage } from "./stage-utils.js";
import type { MemoryUpdateCtx, ResolveMemoryModel, StageOutcome } from "./types.js";

export async function runReflectorStage(
	pi: ExtensionAPI,
	runtime: Runtime,
	ctx: MemoryUpdateCtx,
	resolveModel: ResolveMemoryModel,
): Promise<StageOutcome> {
	const entries = ctx.sessionManager.getBranch() as Entry[];
	const observationCoverageId = latestCoverageMarkerId(entries, OM_OBSERVATIONS_RECORDED);
	if (!observationCoverageId) {
		debugLog("reflector.skip", { reason: "no_observation_coverage" });
		return "continue";
	}

	const folded = foldLedger(entries);
	const unreflectedObservations = observationsSinceReflectionCoverage(entries, folded.activeObservations);
	if (unreflectedObservations.length < runtime.config.reflectEveryObservations) {
		debugLog("reflector.skip", {
			reason: "below_observation_threshold",
			unreflectedObservationCount: unreflectedObservations.length,
			reflectEveryObservations: runtime.config.reflectEveryObservations,
			activeObservationCount: folded.activeObservations.length,
		});
		return "continue";
	}
	debugLog("reflector.stage_run", {
		unreflectedObservationCount: unreflectedObservations.length,
		activeObservationCount: folded.activeObservations.length,
		reflectionCount: folded.reflections.length,
		observationCoverageId,
	});

	if (ctx.hasUI) ctx.ui?.notify(
		`Observational memory: reflector running (${unreflectedObservations.length.toLocaleString()} observations since reflection)`,
		"info",
	);
	const resolved = await resolveModel("reflector");
	if (!resolved) return "abort";

	const reflections = await runReflector({
		...commonAgentArgs(runtime, resolved, runtime.config.reflectorThinking),
		reflections: folded.reflections,
		observations: folded.activeObservations,
	});
	if (!reflections) {
		const reviewedData = buildReflectionsReviewedData(observationCoverageId);
		debugLog("reflector.no_output", { observationCoverageId, appendedReview: reviewedData !== undefined });
		if (reviewedData) pi.appendEntry(OM_REFLECTIONS_REVIEWED, reviewedData);
		return "continue";
	}

	const data = buildReflectionsRecordedData(reflections, observationCoverageId);
	if (!data) return "continue";
	pi.appendEntry(OM_REFLECTIONS_RECORDED, data);
	if (runtime.compactHookInFlight) runtime.transientCompactionReflections.push(...reflections);
	return "continue";
}
