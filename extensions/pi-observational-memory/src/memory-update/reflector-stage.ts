import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { runReflector } from "../agents/reflector/agent.js";
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
	if (!observationCoverageId) return "continue";

	const folded = foldLedger(entries);
	const unreflectedObservations = observationsSinceReflectionCoverage(entries, folded.activeObservations);
	if (unreflectedObservations.length < runtime.config.reflectEveryObservations) return "continue";

	if (ctx.hasUI) ctx.ui?.notify(
		`Observational memory: reflector running (${unreflectedObservations.length.toLocaleString()} observations since reflection)`,
		"info",
	);
	const resolved = await resolveModel("reflector");
	if (!resolved) return "abort";

	const reflections = await runReflector({
		...commonAgentArgs(runtime, resolved),
		reflections: folded.reflections,
		observations: folded.activeObservations,
	});
	if (!reflections) return "continue";

	const data = buildReflectionsRecordedData(reflections, observationCoverageId);
	if (!data) return "continue";
	pi.appendEntry(OM_REFLECTIONS_RECORDED, data);
	return "continue";
}
