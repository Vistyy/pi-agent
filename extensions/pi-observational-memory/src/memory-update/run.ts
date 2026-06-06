import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { runDropper } from "../agents/dropper/agent.js";
import { observationPoolMetrics } from "../agents/dropper/pool.js";
import { runObserver } from "../agents/observer/agent.js";
import { runReflector } from "../agents/reflector/agent.js";
import { STRATEGY } from "../config.js";
import { debugLog, withDebugLogContext } from "../debug-log.js";
import { type ResolveResult, type Runtime } from "../runtime.js";
import { serializeSourceAddressedBranchEntries } from "../memory/serialize.js";
import {
	OM_OBSERVATIONS_DROPPED,
	OM_OBSERVATIONS_RECORDED,
	OM_REFLECTIONS_RECORDED,
	buildObservationsDroppedData,
	buildObservationsRecordedData,
	buildReflectionsRecordedData,
	earlierCoverageMarkerId,
	entryIndexById,
	foldLedger,
	fullProjection,
	isSourceEntry,
	latestCoverageIndex,
	latestCoverageMarkerId,
	observationToSummaryLine,
	rawTokensSinceObservationCoverage,
	rawTokensSinceReflectionCoverage,
	sourceEntryCountSinceObservationCoverage,
	reflectionToSummaryLine,
	type Entry,
	type Reflection,
} from "../session-ledger/index.js";

type ResolvedModel = Extract<ResolveResult, { ok: true }>;

type MemoryUpdateCtx = {
	cwd: string;
	hasUI: boolean;
	ui?: { notify: (message: string, type?: "warning" | "info" | "error") => void };
	model: unknown;
	modelRegistry: any;
	sessionManager: {
		getBranch: () => unknown;
		getSessionId?: () => string;
		getSessionFile?: () => string | undefined;
	};
};

type StageOutcome = "continue" | "abort";

type ReflectorStageResult = {
	outcome: StageOutcome;
	sameRunReflections: Reflection[];
	effectiveReflectionCoverageId?: string;
};

function sourceEntriesAfter(entries: Entry[], index: number, beforeIndex?: number): Entry[] {
	const end = beforeIndex === undefined ? entries.length : Math.max(index + 1, beforeIndex);
	return entries.slice(index + 1, end).filter(isSourceEntry);
}

function appendEntry(pi: ExtensionAPI, customType: string, data: unknown): void {
	pi.appendEntry(customType, data);
}

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
	let reflectorResult: ReflectorStageResult;
	try {
		reflectorResult = await runReflectorStage(pi, runtime, ctx, resolveModel);
		if (reflectorResult.outcome === "abort") return;
	} catch (error) {
		debugLog("reflector.error", { errorMessage: runtime.recordMemoryUpdateStageError(ctx, "reflector", error) });
		return;
	}

	runtime.memoryUpdatePhase = "dropper";
	try {
		await runDropperStage(pi, runtime, ctx, resolveModel, reflectorResult.sameRunReflections, reflectorResult.effectiveReflectionCoverageId);
	} catch (error) {
		debugLog("dropper.error", { errorMessage: runtime.recordMemoryUpdateStageError(ctx, "dropper", error) });
	}
}

async function runObserverStage(
	pi: ExtensionAPI,
	runtime: Runtime,
	ctx: MemoryUpdateCtx,
	resolveModel: (stage: "observer") => Promise<ResolvedModel | undefined>,
	forceObserveBeforeEntryId?: string,
): Promise<StageOutcome> {
	const entries = ctx.sessionManager.getBranch() as Entry[];
	const tokens = rawTokensSinceObservationCoverage(entries);
	const lastCoverageIdx = latestCoverageIndex(entries, OM_OBSERVATIONS_RECORDED);
	const boundaryIdx = forceObserveBeforeEntryId ? entryIndexById(entries).get(forceObserveBeforeEntryId) : undefined;
	const sourceEntryCount = boundaryIdx === undefined
		? sourceEntryCountSinceObservationCoverage(entries)
		: sourceEntriesAfter(entries, lastCoverageIdx, boundaryIdx).length;
	if (sourceEntryCount === 0) return "continue";
	if (boundaryIdx === undefined && sourceEntryCount < runtime.config.observeEveryMessages) return "continue";

	const chunkEntries = sourceEntriesAfter(entries, lastCoverageIdx, boundaryIdx);
	const coversUpToId = chunkEntries.at(-1)?.id;
	if (!coversUpToId) return "continue";
	if (lastCoverageIdx === -1 && tokens > runtime.config.maxInitialObserveTokens) {
		const data = buildObservationsRecordedData([], coversUpToId);
		if (data) appendEntry(pi, OM_OBSERVATIONS_RECORDED, data);
		debugLog("observer.initial_backfill_skipped", { tokens, coversUpToId });
		if (ctx.hasUI) ctx.ui?.notify(
			`Observational memory: skipped initial backfill for large existing session (~${tokens.toLocaleString()} tokens); observing future turns`,
			"warning",
		);
		return "continue";
	}

	const { text: chunk, sourceEntryIds } = serializeSourceAddressedBranchEntries(chunkEntries);
	if (!chunk.trim() || sourceEntryIds.length === 0) return "continue";

	const memory = fullProjection(entries);
	const priorReflections = memory.reflections.map(reflectionToSummaryLine);
	const priorObservations = memory.observations.map(observationToSummaryLine);

	if (ctx.hasUI) ctx.ui?.notify(
		`Observational memory: observer running on ${sourceEntryCount.toLocaleString()} source entr${sourceEntryCount === 1 ? "y" : "ies"}`,
		"info",
	);
	debugLog("observer.start", {
		tokens,
		coversUpToId,
		sourceEntryIds,
		sourceEntryCount: sourceEntryIds.length,
		priorReflections: priorReflections.length,
		priorObservations: priorObservations.length,
	});

	const resolved = await resolveModel("observer");
	if (!resolved) return "abort";

	const observations = await runObserver({
		model: resolved.model as any,
		apiKey: resolved.apiKey,
		headers: resolved.headers,
		priorReflections,
		priorObservations,
		chunk,
		allowedSourceEntryIds: sourceEntryIds,
		maxTurns: runtime.config.agentMaxTurns,
		thinkingLevel: runtime.config.model?.thinking ?? "low",
	});
	if (!observations || observations.length === 0) {
		debugLog("observer.empty", { coversUpToId });
		if (ctx.hasUI) ctx.ui?.notify(
			"Observational memory: observer returned no observations",
			"warning",
		);
		return "continue";
	}

	const data = buildObservationsRecordedData(observations, coversUpToId);
	if (!data) return "continue";
	debugLog("observer.records", {
		count: observations.length,
		observationTokens: observations.reduce((sum, observation) => sum + observation.tokenCount, 0),
		coversUpToId,
	});
	appendEntry(pi, OM_OBSERVATIONS_RECORDED, data);
	debugLog("observer.appended", { count: observations.length, coversUpToId });
	if (ctx.hasUI) ctx.ui?.notify(
		`Observational memory: ${observations.length} observation${observations.length === 1 ? "" : "s"} recorded`,
		"info",
	);
	return "continue";
}

async function runReflectorStage(
	pi: ExtensionAPI,
	runtime: Runtime,
	ctx: MemoryUpdateCtx,
	resolveModel: (stage: "reflector") => Promise<ResolvedModel | undefined>,
): Promise<ReflectorStageResult> {
	const entries = ctx.sessionManager.getBranch() as Entry[];
	const reflectionTokens = rawTokensSinceReflectionCoverage(entries);
	if (reflectionTokens < runtime.config.reflectAfterTokens) return { outcome: "continue", sameRunReflections: [] };

	const observationCoverageId = latestCoverageMarkerId(entries, OM_OBSERVATIONS_RECORDED);
	if (!observationCoverageId) return { outcome: "continue", sameRunReflections: [] };

	if (ctx.hasUI) ctx.ui?.notify(
		`Observational memory: reflector running (~${reflectionTokens.toLocaleString()} tokens)`,
		"info",
	);
	const resolved = await resolveModel("reflector");
	if (!resolved) return { outcome: "abort", sameRunReflections: [] };

	const folded = foldLedger(entries);
	const reflections = await runReflector({
		model: resolved.model as any,
		apiKey: resolved.apiKey,
		headers: resolved.headers,
		reflections: folded.reflections,
		observations: folded.activeObservations,
		maxTurns: runtime.config.agentMaxTurns,
		thinkingLevel: runtime.config.model?.thinking ?? "low",
	});
	if (!reflections) return { outcome: "continue", sameRunReflections: [] };

	const data = buildReflectionsRecordedData(reflections, observationCoverageId);
	if (!data) return { outcome: "continue", sameRunReflections: [] };
	appendEntry(pi, OM_REFLECTIONS_RECORDED, data);
	return {
		outcome: "continue",
		sameRunReflections: reflections,
		effectiveReflectionCoverageId: data.coversUpToId,
	};
}

async function runDropperStage(
	pi: ExtensionAPI,
	runtime: Runtime,
	ctx: MemoryUpdateCtx,
	resolveModel: (stage: "dropper") => Promise<ResolvedModel | undefined>,
	_sameRunReflections: Reflection[],
	_sameRunReflectionCoverageId: string | undefined,
): Promise<StageOutcome> {
	const entries = ctx.sessionManager.getBranch() as Entry[];
	const observationCoverageId = latestCoverageMarkerId(entries, OM_OBSERVATIONS_RECORDED);
	const reflectionCoverageId = latestCoverageMarkerId(entries, OM_REFLECTIONS_RECORDED);
	if (!observationCoverageId || !reflectionCoverageId) {
		debugLog("dropper.waiting_for_reflection", { hasObservationCoverage: Boolean(observationCoverageId), hasReflectionCoverage: Boolean(reflectionCoverageId) });
		return "continue";
	}

	const folded = foldLedger(entries);
	if (folded.reflections.length === 0) {
		debugLog("dropper.waiting_for_reflection", { reflectionCount: 0 });
		return "continue";
	}
	const metrics = observationPoolMetrics(folded.activeObservations, runtime.config.observationsPoolTargetTokens);
	if (!metrics.ready) {
		debugLog("dropper.not_ready", {
			observationTokens: metrics.observationTokens,
			targetTokens: metrics.targetTokens,
			tokensOverTarget: metrics.tokensOverTarget,
			fullness: metrics.fullness,
			activeObservationCount: metrics.activeObservationCount,
			droppableCount: metrics.droppableCount,
			maxDropsAllowed: metrics.maxDropsAllowed,
		});
		return "continue";
	}
	debugLog("dropper.stage_start", {
		observationCoverageId,
		reflectionCoverageId,
		reflectionCount: folded.reflections.length,
		activeObservationCount: metrics.activeObservationCount,
		observationTokens: metrics.observationTokens,
		targetTokens: metrics.targetTokens,
		tokensOverTarget: metrics.tokensOverTarget,
		fullness: metrics.fullness,
		maxDropsAllowed: metrics.maxDropsAllowed,
	});

	if (ctx.hasUI) ctx.ui?.notify(
		`Observational memory: dropper running after reflection — active observation pool ~${metrics.observationTokens.toLocaleString()} / ${metrics.targetTokens.toLocaleString()} target tokens (${Math.round(metrics.fullness * 100).toLocaleString()}%)`,
		"info",
	);
	const resolved = await resolveModel("dropper");
	if (!resolved) return "abort";

	const droppedIds = await runDropper({
		model: resolved.model as any,
		apiKey: resolved.apiKey,
		headers: resolved.headers,
		reflections: folded.reflections,
		observations: folded.activeObservations,
		targetTokens: runtime.config.observationsPoolTargetTokens,
		maxTurns: runtime.config.agentMaxTurns,
		thinkingLevel: runtime.config.model?.thinking ?? "low",
	});
	const coversUpToId = earlierCoverageMarkerId(entries, observationCoverageId, reflectionCoverageId);
	const data = coversUpToId && droppedIds ? buildObservationsDroppedData(droppedIds, coversUpToId) : undefined;
	debugLog("dropper.append", {
		droppedIdsCount: droppedIds?.length ?? 0,
		coversUpToId,
		dataBuilt: data !== undefined,
		appended: data !== undefined,
	});
	if (data) appendEntry(pi, OM_OBSERVATIONS_DROPPED, data);
	return "continue";
}
