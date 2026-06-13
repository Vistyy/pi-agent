import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { debugLog } from "../debug-log.js";
import { type ResolveResult, type Runtime } from "../runtime.js";
import {
	OM_AGENT_RUN_RECORDED,
	foldLedger,
	fullProjection,
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

export type MemoryStageName = "observer" | "reflector" | "curator";

export function makeModelResolver(runtime: Runtime, ctx: MemoryUpdateCtx): (stage: MemoryStageName) => Promise<ResolvedModel | undefined> {
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

async function runMemoryUpdateStage(
	pi: ExtensionAPI,
	runtime: Runtime,
	ctx: MemoryUpdateCtx,
	stage: "observer" | "reflector" | "curator",
	run: () => Promise<StageOutcome>,
): Promise<StageOutcome> {
	runtime.memoryUpdatePhase = stage;
	const started = Date.now();
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
		pi.appendEntry(OM_AGENT_RUN_RECORDED, {
			schemaVersion: 1,
			agent: stage,
			status: outcome === "abort" ? "error" : "ok",
			reason,
			durationMs: Date.now() - started,
		});
	}
}

export async function runMemoryUpdate(
	pi: ExtensionAPI,
	runtime: Runtime,
	ctx: MemoryUpdateCtx,
): Promise<void> {
	const resolveModel = makeModelResolver(runtime, ctx);
	let entries = ctx.sessionManager.getBranch() as Entry[];
	let due = memoryUpdateDueReasons(entries, runtime);

	if (due.observer) {
		const observerWork = runMemoryUpdateStage(
			pi,
			runtime,
			ctx,
			"observer",
			async () => {
				const { runObserverStage } = await loadObserverStage();
				return runObserverStage(pi, runtime, ctx, resolveModel);
			},
		);
		const observerPromise = observerWork.then(() => undefined);
		runtime.inFlightObserverStagePromise = observerPromise;
		let observerOutcome: StageOutcome;
		try {
			observerOutcome = await observerWork;
		} finally {
			if (runtime.inFlightObserverStagePromise === observerPromise) runtime.inFlightObserverStagePromise = null;
		}
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
