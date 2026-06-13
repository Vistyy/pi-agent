import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { STRATEGY } from "../config.js";
import { debugLog, debugSessionMetadata, withDebugLogContext } from "../debug-log.js";
import type { Runtime } from "../runtime.js";
import { OM_AGENT_RUN_RECORDED, OM_OBSERVATIONS_RECORDED, entryIndexById, latestCoverageIndex, type Entry } from "../session-ledger/index.js";
import { makeModelResolver, type MemoryStageName } from "./model-resolver.js";
import { sourceEntriesAfter } from "./source-entries.js";
import type { MemoryUpdateCtx, ResolvedModel, StageOutcome } from "./types.js";

type ObserverStageModule = typeof import("./observer-stage.js");
let observerStageModule: Promise<ObserverStageModule> | undefined;

function loadObserverStage(): Promise<ObserverStageModule> {
	return observerStageModule ??= import("./observer-stage.js");
}

export async function ensureObservedBeforeCompaction(
	pi: ExtensionAPI,
	runtime: Runtime,
	ctx: MemoryUpdateCtx,
	options: { firstKeptEntryId?: string } = {},
): Promise<void> {
	runtime.ensureConfig(ctx.cwd);
	if (runtime.config.strategy === STRATEGY.off) return;
	if (runtime.inFlightObserverStagePromise) await runtime.inFlightObserverStagePromise;
	const entries = ctx.sessionManager.getBranch() as Entry[];
	const firstKeptIndex = entryIndexById(entries).get(options.firstKeptEntryId ?? "");
	const lastCoverageIdx = latestCoverageIndex(entries, OM_OBSERVATIONS_RECORDED);
	const hasUnobservedCompactedPrefix = firstKeptIndex !== undefined
		&& sourceEntriesAfter(entries, lastCoverageIdx, firstKeptIndex).length > 0;
	if (!hasUnobservedCompactedPrefix) return;
	const runId = `compaction-observer-flush-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 8)}`;
	const sessionMetadata = debugSessionMetadata(ctx);
	await withDebugLogContext({
		enabled: runtime.config.debugLog === true,
		cwd: ctx.cwd,
		...sessionMetadata,
		runId,
	}, async () => {
		const resolveModel = makeModelResolver(runtime, ctx);
		await runCompactionObserverFlush(pi, runtime, ctx, resolveModel, options.firstKeptEntryId);
	});
}

async function runCompactionObserverFlush(
	pi: ExtensionAPI,
	runtime: Runtime,
	ctx: MemoryUpdateCtx,
	resolveModel: (stage: MemoryStageName) => Promise<ResolvedModel | undefined>,
	firstKeptEntryId: string | undefined,
): Promise<StageOutcome> {
	const stage: MemoryStageName = "observer";
	const started = Date.now();
	let outcome: StageOutcome = "abort";
	let reason: string | undefined;
	try {
		const { runObserverStage } = await loadObserverStage();
		outcome = await runObserverStage(pi, runtime, ctx, resolveModel, firstKeptEntryId);
		return outcome;
	} catch (error) {
		reason = runtime.recordMemoryUpdateStageError(ctx, stage, error);
		debugLog(`${stage}.error`, { errorMessage: reason });
		return "abort";
	} finally {
		pi.appendEntry(OM_AGENT_RUN_RECORDED, {
			schemaVersion: 1,
			agent: stage,
			status: outcome === "abort" ? "error" : "ok",
			reason,
			durationMs: Date.now() - started,
		});
	}
}
