import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { runReflector } from "../agents/reflector/agent.js";
import { debugLog } from "../debug-log.js";
import type { Runtime } from "../runtime.js";
import {
	OM_OBSERVATIONS_RECORDED,
	OM_REFLECTIONS_RECORDED,
	buildReflectionsRecordedData,
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
	const reflectionWorkCount = unreflectedObservations.length;
	if (reflectionWorkCount < runtime.config.reflectEveryObservations) {
		debugLog("reflector.skip", {
			reason: "below_observation_threshold",
			unreflectedObservationCount: unreflectedObservations.length,
			reflectionWorkCount,
			reflectEveryObservations: runtime.config.reflectEveryObservations,
			activeObservationCount: folded.activeObservations.length,
		});
		return "continue";
	}
	debugLog("reflector.stage_run", {
		unreflectedObservationCount: unreflectedObservations.length,
		activeObservationCount: folded.activeObservations.length,
		reflectionWorkCount,
		reflectionCount: folded.reflections.length,
		observationCoverageId,
	});

	if (ctx.hasUI) ctx.ui?.notify(
		`Observational memory: reflector running (${reflectionWorkCount.toLocaleString()} unreviewed observation${reflectionWorkCount === 1 ? "" : "s"})`,
		"info",
	);
	const resolved = await resolveModel("reflector");
	if (!resolved) return "abort";

	const reflections = await runReflector({
		...commonAgentArgs(pi, runtime, resolved, runtime.config.reflectorThinking),
		reflections: folded.reflections,
		observations: folded.activeObservations,
	});
	if (!reflections) {
		debugLog("reflector.no_tool_output", { observationCoverageId });
		return "continue";
	}
	if (reflections.length === 0) debugLog("reflector.reviewed_empty", { observationCoverageId });

	const data = buildReflectionsRecordedData(reflections, observationCoverageId);
	if (!data) return "continue";
	pi.appendEntry(OM_REFLECTIONS_RECORDED, data);
	return "continue";
}
