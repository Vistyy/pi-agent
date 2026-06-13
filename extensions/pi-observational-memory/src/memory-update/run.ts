import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { debugLog } from "../debug-log.js";
import type { Runtime } from "../runtime.js";
import { OM_AGENT_RUN_RECORDED, type Entry } from "../session-ledger/index.js";
import { computeMemoryStageDue } from "./due.js";
import { makeModelResolver, type MemoryStageName } from "./model-resolver.js";
import type { MemoryUpdateCtx, StageOutcome } from "./types.js";

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

async function runTrackedStage(
	pi: ExtensionAPI,
	runtime: Runtime,
	ctx: MemoryUpdateCtx,
	stage: MemoryStageName,
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
	let due = computeMemoryStageDue(entries, runtime);

	if (due.observerDue) {
		const observerWork = runTrackedStage(
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
		due = computeMemoryStageDue(entries, runtime);
	}

	let ranReflector = false;
	if (due.reflectorDue) {
		const reflectorOutcome = await runTrackedStage(
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
		due = computeMemoryStageDue(entries, runtime);
	}

	if (!ranReflector && !due.curatorEmergencyDue) return;
	await runTrackedStage(
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
