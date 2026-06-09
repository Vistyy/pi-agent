import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { STRATEGY } from "../config.js";
import { debugLog, withDebugLogContext } from "../debug-log.js";
import { type ResolveResult, type Runtime } from "../runtime.js";
import {
	OM_AGENT_RUN_RECORDED,
	OM_OBSERVATIONS_RECORDED,
	entryIndexById,
	foldLedger,
	latestCoverageIndex,
	sourceEntryCountSinceObservationCoverage,
	type Entry,
} from "../session-ledger/index.js";
type ObserverStageModule = typeof import("./observer-stage.js");
type ReflectorStageModule = typeof import("./reflector-stage.js");
type DropperStageModule = typeof import("./dropper-stage.js");

let observerStageModule: Promise<ObserverStageModule> | undefined;
let reflectorStageModule: Promise<ReflectorStageModule> | undefined;
let dropperStageModule: Promise<DropperStageModule> | undefined;

function loadObserverStage(): Promise<ObserverStageModule> {
	return observerStageModule ??= import("./observer-stage.js");
}

function loadReflectorStage(): Promise<ReflectorStageModule> {
	return reflectorStageModule ??= import("./reflector-stage.js");
}

function loadDropperStage(): Promise<DropperStageModule> {
	return dropperStageModule ??= import("./dropper-stage.js");
}
import { sourceEntriesAfter } from "./source-entries.js";
import { observationsSinceReflectionCoverage } from "./stage-utils.js";
import type { MemoryUpdateCtx, ResolvedModel, StageOutcome } from "./types.js";

export function anyMemoryUpdateStageDue(entries: Entry[], runtime: Runtime): boolean {
	const folded = foldLedger(entries);
	const activeObservationCount = folded.activeObservations.length;
	const unreflectedObservationCount = observationsSinceReflectionCoverage(entries, folded.activeObservations).length;
	return sourceEntryCountSinceObservationCoverage(entries) >= runtime.config.observeEveryMessages
		|| unreflectedObservationCount >= runtime.config.reflectEveryObservations
		|| activeObservationCount > runtime.config.dropWhenActiveObservationsOver;
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
	const runId = `compaction-memory-update-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 8)}`;
	const sessionMetadata = debugSessionMetadata(ctx);
	await withDebugLogContext({
		enabled: runtime.config.debugLog === true,
		cwd: ctx.cwd,
		...sessionMetadata,
		runId,
	}, async () => runMemoryUpdate(pi, runtime, ctx, { forceObserveBeforeEntryId: options.firstKeptEntryId }));
}

async function runMemoryUpdateStage(
	pi: ExtensionAPI,
	runtime: Runtime,
	ctx: MemoryUpdateCtx,
	stage: "observer" | "reflector" | "dropper",
	run: () => Promise<StageOutcome>,
): Promise<StageOutcome> {
	runtime.memoryUpdatePhase = stage;
	const started = Date.now();
	const before = { ...runtime.memoryAgentUsage[stage] };
	let outcome: StageOutcome = "abort";
	let reason: string | undefined;
	try {
		outcome = await run();
		return outcome;
	} catch (error) {
		reason = runtime.recordMemoryUpdateStageError(ctx, stage, error);
		debugLog(`${stage}.error`, { errorMessage: reason });
		return "abort";
	} finally {
		const after = runtime.memoryAgentUsage[stage];
		pi.appendEntry(OM_AGENT_RUN_RECORDED, {
			schemaVersion: 1,
			agent: stage,
			status: outcome === "abort" ? "error" : "ok",
			reason,
			durationMs: Date.now() - started,
			requestCount: after.requests - before.requests,
			costTotal: after.cost - before.cost,
			totalTokens: after.totalTokens - before.totalTokens,
		});
	}
}

export async function runMemoryUpdate(
	pi: ExtensionAPI,
	runtime: Runtime,
	ctx: MemoryUpdateCtx,
	options: { forceObserveBeforeEntryId?: string } = {},
): Promise<void> {
	const resolveModel = makeModelResolver(runtime, ctx);

	const observerOutcome = await runMemoryUpdateStage(
		pi,
		runtime,
		ctx,
		"observer",
		async () => {
			const { runObserverStage } = await loadObserverStage();
			return runObserverStage(pi, runtime, ctx, resolveModel, options.forceObserveBeforeEntryId);
		},
	);
	if (observerOutcome === "abort") return;

	const reflectorOutcome = await runMemoryUpdateStage(
		pi,
		runtime,
		ctx,
		"reflector",
		async () => {
			const { runReflectorStage } = await loadReflectorStage();
			return runReflectorStage(pi, runtime, ctx, resolveModel);
		},
	);
	if (reflectorOutcome === "abort") return;

	await runMemoryUpdateStage(
		pi,
		runtime,
		ctx,
		"dropper",
		async () => {
			const { runDropperStage } = await loadDropperStage();
			return runDropperStage(pi, runtime, ctx, resolveModel);
		},
	);
}
