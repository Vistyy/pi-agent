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
	latestReflectionReviewEntryIndex,
	type Entry,
} from "../session-ledger/index.js";
import { appendTransientCompactionReflections } from "./compaction-state.js";
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

	const folded = foldLedger(entries, { pendingFlagsAfterIndex: latestReflectionReviewEntryIndex(entries) });
	const unreflectedObservations = observationsSinceReflectionCoverage(entries, folded.activeObservations);
	const flaggedObservations = folded.activeObservations
		.filter((observation) => folded.flaggedObservationIds.has(observation.id))
		.map((observation) => ({
			observation,
			reasons: folded.flaggedObservationReasonsById.get(observation.id) ?? [],
		}));
	const reflectionWorkCount = unreflectedObservations.length + flaggedObservations.length;
	if (reflectionWorkCount < runtime.config.reflectEveryObservations) {
		debugLog("reflector.skip", {
			reason: "below_observation_threshold",
			unreflectedObservationCount: unreflectedObservations.length,
			flaggedObservationCount: flaggedObservations.length,
			reflectionWorkCount,
			reflectEveryObservations: runtime.config.reflectEveryObservations,
			activeObservationCount: folded.activeObservations.length,
		});
		return "continue";
	}
	debugLog("reflector.stage_run", {
		unreflectedObservationCount: unreflectedObservations.length,
		activeObservationCount: folded.activeObservations.length,
		flaggedObservationCount: flaggedObservations.length,
		reflectionWorkCount,
		reflectionCount: folded.reflections.length,
		observationCoverageId,
	});

	if (ctx.hasUI) ctx.ui?.notify(
		`Observational memory: reflector running (${reflectionWorkCount.toLocaleString()} reflection work items: ${unreflectedObservations.length.toLocaleString()} unreviewed, ${flaggedObservations.length.toLocaleString()} flagged)`,
		"info",
	);
	const resolved = await resolveModel("reflector");
	if (!resolved) return "abort";

	const reflections = await runReflector({
		...commonAgentArgs(pi, runtime, resolved, runtime.config.reflectorThinking),
		reflections: folded.reflections,
		observations: folded.activeObservations,
		flaggedObservations,
	});
	if (!reflections) {
		debugLog("reflector.no_tool_output", { observationCoverageId });
		return "continue";
	}
	if (reflections.length === 0) {
		const reviewedData = buildReflectionsReviewedData(observationCoverageId);
		debugLog("reflector.reviewed_empty", { observationCoverageId, appendedReview: reviewedData !== undefined });
		if (reviewedData) pi.appendEntry(OM_REFLECTIONS_REVIEWED, reviewedData);
		return "continue";
	}

	const data = buildReflectionsRecordedData(reflections, observationCoverageId);
	if (!data) return "continue";
	pi.appendEntry(OM_REFLECTIONS_RECORDED, data);
	appendTransientCompactionReflections(runtime, reflections);
	return "continue";
}
