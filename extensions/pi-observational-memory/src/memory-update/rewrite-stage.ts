import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { runRewrite } from "../agents/rewrite/agent.js";
import { debugLog } from "../debug-log.js";
import type { Runtime } from "../runtime.js";
import {
	OM_REFLECTIONS_RECORDED,
	OM_REFLECTIONS_REWRITTEN,
	buildReflectionsRecordedData,
	buildReflectionsRewrittenData,
	foldLedger,
	reflectionTokenSum,
	type Entry,
} from "../session-ledger/index.js";
import { appendTransientCompactionReflections } from "./compaction-state.js";
import { commonAgentArgs } from "./stage-utils.js";
import type { MemoryUpdateCtx, ResolveMemoryModel, StageOutcome } from "./types.js";

const MIN_REWRITE_REFLECTIONS = 5;

export async function runRewriteStage(
	pi: ExtensionAPI,
	runtime: Runtime,
	ctx: MemoryUpdateCtx,
	resolveModel: ResolveMemoryModel,
): Promise<StageOutcome> {
	const entries = ctx.sessionManager.getBranch() as Entry[];
	const folded = foldLedger(entries);
	const activeTokens = reflectionTokenSum(folded.reflections);
	if (folded.reflections.length < MIN_REWRITE_REFLECTIONS || activeTokens < runtime.config.reflectionsPoolMaxTokens) {
		debugLog("rewrite.skip", { reason: "below_threshold", reflectionCount: folded.reflections.length, activeTokens, reflectionsPoolMaxTokens: runtime.config.reflectionsPoolMaxTokens });
		return "continue";
	}

	if (ctx.hasUI) ctx.ui?.notify(`Observational memory: rewrite running (${folded.reflections.length.toLocaleString()} reflections, ~${activeTokens.toLocaleString()} tokens)`, "info");
	const resolved = await resolveModel("rewrite");
	if (!resolved) return "abort";

	const result = await runRewrite({
		...commonAgentArgs(pi, runtime, resolved, runtime.config.rewriteThinking),
		reflections: folded.reflections,
	});
	if (!result) return "continue";

	const recordedData = buildReflectionsRecordedData(result.reflections, entries.at(-1)?.id ?? "rewrite");
	const rewrittenData = buildReflectionsRewrittenData({
		retiredReflectionIds: result.retiredReflectionIds,
		newReflectionIds: result.newReflectionIds,
		retainedSourceIds: result.retainedSourceIds,
		discardedReflectionIds: result.discardedReflectionIds,
		discardedSummary: result.discardedSummary,
	});
	if (!recordedData || !rewrittenData) return "continue";
	pi.appendEntry(OM_REFLECTIONS_RECORDED, recordedData);
	pi.appendEntry(OM_REFLECTIONS_REWRITTEN, rewrittenData);
	appendTransientCompactionReflections(runtime, result.reflections);
	return "continue";
}
