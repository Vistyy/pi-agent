import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { STRATEGY } from "../config.js";
import { debugLog, withDebugLogContext } from "../debug-log.js";
import { type ResolveResult, type Runtime } from "../runtime.js";
import {
	OM_OBSERVATIONS_RECORDED,
	entryIndexById,
	latestCoverageIndex,
	rawTokensSinceReflectionCoverage,
	sourceEntryCountSinceObservationCoverage,
	type Entry,
} from "../session-ledger/index.js";
import { runDropperStage } from "./dropper-stage.js";
import { runObserverStage } from "./observer-stage.js";
import { runReflectorStage } from "./reflector-stage.js";
import { sourceEntriesAfter } from "./source-entries.js";
import type { MemoryUpdateCtx, ResolvedModel } from "./types.js";

export function anyMemoryUpdateStageDue(entries: Entry[], runtime: Runtime): boolean {
	return sourceEntryCountSinceObservationCoverage(entries) >= runtime.config.observeEveryMessages
		|| rawTokensSinceReflectionCoverage(entries) >= runtime.config.reflectAfterTokens;
}

function makeModelResolver(runtime: Runtime, ctx: MemoryUpdateCtx): (stage: "observer" | "reflector" | "dropper") => Promise<ResolvedModel | undefined> {
	let cached: ResolveResult | undefined;
	return async (stage) => {
		cached ??= await runtime.resolveModel({
			model: ctx.model,
			modelRegistry: ctx.modelRegistry,
			hasUI: ctx.hasUI,
			ui: ctx.ui,
		});
		if (cached.ok) {
			runtime.resolveFailureNotified = false;
			return cached;
		}
		debugLog(`${stage}.model_unavailable`, { reason: cached.reason });
		if (!runtime.resolveFailureNotified && ctx.hasUI && ctx.ui) {
			ctx.ui.notify(`Observational memory: ${stage} skipped — ${cached.reason}`, "warning");
			runtime.resolveFailureNotified = true;
		}
		return undefined;
	};
}

export function registerMemoryUpdateHook(pi: ExtensionAPI, runtime: Runtime): void {
	const launch = (_event: unknown, ctx: MemoryUpdateCtx) => {
		maybeLaunchMemoryUpdate(pi, runtime, ctx);
	};
	pi.on("agent_start", launch);
	pi.on("message_end", launch);
	pi.on("turn_end", launch);
}

function debugSessionMetadata(ctx: MemoryUpdateCtx): { sessionId?: string; sessionFile?: string } {
	try {
		return {
			sessionId: ctx.sessionManager.getSessionId?.(),
			sessionFile: ctx.sessionManager.getSessionFile?.(),
		};
	} catch {
		return {};
	}
}

function maybeLaunchMemoryUpdate(pi: ExtensionAPI, runtime: Runtime, ctx: MemoryUpdateCtx): void {
	runtime.ensureConfig(ctx.cwd);
	if (runtime.config.strategy === STRATEGY.off) return;
	if (runtime.memoryUpdateInFlight) return;

	const entries = ctx.sessionManager.getBranch() as Entry[];
	if (!anyMemoryUpdateStageDue(entries, runtime)) return;

	const runId = `memory-update-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 8)}`;
	const memoryUpdateCtx: MemoryUpdateCtx = {
		cwd: ctx.cwd,
		hasUI: ctx.hasUI,
		ui: ctx.ui,
		model: ctx.model,
		modelRegistry: ctx.modelRegistry,
		sessionManager: ctx.sessionManager,
	};

	const sessionMetadata = debugSessionMetadata(ctx);
	void runtime.launchMemoryUpdateTask(ctx, async () => withDebugLogContext({
		enabled: runtime.config.debugLog === true,
		cwd: ctx.cwd,
		...sessionMetadata,
		runId,
	}, async () => {
		await runMemoryUpdate(pi, runtime, memoryUpdateCtx);
	}));
}

export async function ensureMemoryUpdatedBeforeCompaction(
	pi: ExtensionAPI,
	runtime: Runtime,
	ctx: MemoryUpdateCtx,
	options: { firstKeptEntryId?: string } = {},
): Promise<void> {
	runtime.ensureConfig(ctx.cwd);
	if (runtime.config.strategy === STRATEGY.off) return;
	if (runtime.memoryUpdatePromise) await runtime.memoryUpdatePromise;
	if (runtime.memoryUpdateInFlight) return;
	const entries = ctx.sessionManager.getBranch() as Entry[];
	const firstKeptIndex = entryIndexById(entries).get(options.firstKeptEntryId ?? "");
	const lastCoverageIdx = latestCoverageIndex(entries, OM_OBSERVATIONS_RECORDED);
	const hasUnobservedCompactedPrefix = firstKeptIndex !== undefined
		&& sourceEntriesAfter(entries, lastCoverageIdx, firstKeptIndex).length > 0;
	if (!hasUnobservedCompactedPrefix && !anyMemoryUpdateStageDue(entries, runtime)) return;
	await runMemoryUpdate(pi, runtime, ctx, { forceObserveBeforeEntryId: options.firstKeptEntryId });
}

export async function runMemoryUpdate(
	pi: ExtensionAPI,
	runtime: Runtime,
	ctx: MemoryUpdateCtx,
	options: { forceObserveBeforeEntryId?: string } = {},
): Promise<void> {
	const resolveModel = makeModelResolver(runtime, ctx);

	runtime.memoryUpdatePhase = "observer";
	try {
		const observerOutcome = await runObserverStage(pi, runtime, ctx, resolveModel, options.forceObserveBeforeEntryId);
		if (observerOutcome === "abort") return;
	} catch (error) {
		debugLog("observer.error", { errorMessage: runtime.recordMemoryUpdateStageError(ctx, "observer", error) });
		return;
	}

	runtime.memoryUpdatePhase = "reflector";
	try {
		const reflectorResult = await runReflectorStage(pi, runtime, ctx, resolveModel);
		if (reflectorResult.outcome === "abort") return;
	} catch (error) {
		debugLog("reflector.error", { errorMessage: runtime.recordMemoryUpdateStageError(ctx, "reflector", error) });
		return;
	}

	runtime.memoryUpdatePhase = "dropper";
	try {
		await runDropperStage(pi, runtime, ctx, resolveModel);
	} catch (error) {
		debugLog("dropper.error", { errorMessage: runtime.recordMemoryUpdateStageError(ctx, "dropper", error) });
	}
}
