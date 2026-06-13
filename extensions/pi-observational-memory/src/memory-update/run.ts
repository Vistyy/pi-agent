import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { STRATEGY } from "../config.js";
import { debugLog, withDebugLogContext } from "../debug-log.js";
import { type ResolveResult, type Runtime } from "../runtime.js";
import {
	OM_AGENT_RUN_RECORDED,
	OM_OBSERVATIONS_RECORDED,
	entryIndexById,
	foldLedger,
	fullProjection,
	latestCoverageIndex,
	latestReflectionReviewEntryIndex,
	nextContextProjection,
	sourceEntryCountSinceObservationCoverage,
	type Entry,
} from "../session-ledger/index.js";
type ObserverStageModule = typeof import("./observer-stage.js");
type ReflectorStageModule = typeof import("./reflector-stage.js");
type CuratorStageModule = typeof import("./curator-stage.js");

let observerStageModule: Promise<ObserverStageModule> | undefined;
let reflectorStageModule: Promise<ReflectorStageModule> | undefined;
let curatorStageModule: Promise<CuratorStageModule> | undefined;

function loadObserverStage(): Promise<ObserverStageModule> {
	return observerStageModule ??= import("./observer-stage.js");
}

function loadReflectorStage(): Promise<ReflectorStageModule> {
	return reflectorStageModule ??= import("./reflector-stage.js");
}

function loadCuratorStage(): Promise<CuratorStageModule> {
	return curatorStageModule ??= import("./curator-stage.js");
}
import { sourceEntriesAfter } from "./source-entries.js";
import { observationsSinceReflectionCoverage } from "./stage-utils.js";
import type { MemoryUpdateCtx, ResolvedModel, StageOutcome } from "./types.js";

function memoryUpdateDueReasons(entries: Entry[], runtime: Runtime): { observer: boolean; reflector: boolean; curatorEmergency: boolean } {
	const folded = foldLedger(entries, { pendingFlagsAfterIndex: latestReflectionReviewEntryIndex(entries) });
	const unreflectedObservationCount = observationsSinceReflectionCoverage(entries, folded.activeObservations).length;
	const flaggedActiveObservationCount = folded.activeObservations.filter((observation) => folded.flaggedObservationIds.has(observation.id)).length;
	const reflectionWorkCount = unreflectedObservationCount + flaggedActiveObservationCount;
	const visibleObservationCount = nextContextProjection(entries, fullProjection(entries)).observations.length;
	return {
		observer: sourceEntryCountSinceObservationCoverage(entries) >= runtime.config.observeEveryMessages,
		reflector: reflectionWorkCount >= runtime.config.reflectEveryObservations,
		curatorEmergency: visibleObservationCount > runtime.config.emergencyCurateWhenVisibleObservationsOver,
	};
}

export function anyMemoryUpdateStageDue(entries: Entry[], runtime: Runtime): boolean {
	const due = memoryUpdateDueReasons(entries, runtime);
	return due.observer || due.reflector || due.curatorEmergency;
}

function makeModelResolver(runtime: Runtime, ctx: MemoryUpdateCtx): (stage: "observer" | "reflector" | "curator") => Promise<ResolvedModel | undefined> {
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
	if (runtime.observerStagePromise) await runtime.observerStagePromise;
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
		await runMemoryUpdateStage(
			pi,
			runtime,
			ctx,
			"observer",
			async () => {
				const { runObserverStage } = await loadObserverStage();
				return runObserverStage(pi, runtime, ctx, resolveModel, options.firstKeptEntryId);
			},
			{ updateMemoryPhase: false, trackObserverPromise: false },
		);
	});
}

async function runMemoryUpdateStage(
	pi: ExtensionAPI,
	runtime: Runtime,
	ctx: MemoryUpdateCtx,
	stage: "observer" | "reflector" | "curator",
	run: () => Promise<StageOutcome>,
	options: { updateMemoryPhase?: boolean; trackObserverPromise?: boolean } = {},
): Promise<StageOutcome> {
	const updateMemoryPhase = options.updateMemoryPhase ?? true;
	const trackObserverPromise = stage === "observer" && (options.trackObserverPromise ?? true);
	if (updateMemoryPhase) runtime.memoryUpdatePhase = stage;
	const started = Date.now();
	const before = { ...runtime.memoryAgentUsage[stage] };
	let outcome: StageOutcome = "abort";
	let reason: string | undefined;
	const work = (async () => {
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
	})();
	if (trackObserverPromise) {
		const observerPromise = work.then(() => undefined);
		runtime.observerStagePromise = observerPromise;
		try {
			return await work;
		} finally {
			if (runtime.observerStagePromise === observerPromise) runtime.observerStagePromise = null;
		}
	}
	return work;
}

export async function runMemoryUpdate(
	pi: ExtensionAPI,
	runtime: Runtime,
	ctx: MemoryUpdateCtx,
	options: { forceObserveBeforeEntryId?: string } = {},
): Promise<void> {
	const resolveModel = makeModelResolver(runtime, ctx);
	let entries = ctx.sessionManager.getBranch() as Entry[];
	let due = memoryUpdateDueReasons(entries, runtime);

	if (due.observer || options.forceObserveBeforeEntryId) {
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
		entries = ctx.sessionManager.getBranch() as Entry[];
		due = memoryUpdateDueReasons(entries, runtime);
	}

	let ranReflector = false;
	if (due.reflector) {
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
		ranReflector = true;
		entries = ctx.sessionManager.getBranch() as Entry[];
		due = memoryUpdateDueReasons(entries, runtime);
	}

	if (!ranReflector && !due.curatorEmergency) return;
	await runMemoryUpdateStage(
		pi,
		runtime,
		ctx,
		"curator",
		async () => {
			const { runCuratorStage } = await loadCuratorStage();
			return runCuratorStage(pi, runtime, ctx, resolveModel);
		},
	);
}
