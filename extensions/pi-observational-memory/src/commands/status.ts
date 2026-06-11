import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { observationPoolMetrics } from "../agents/dropper/pool.js";
import { observationsSinceReflectionCoverage } from "../memory-update/stage-utils.js";
import type { Runtime } from "../runtime.js";
import {
	contextProjection,
	diffContextProjection,
	foldAgentUsage,
	foldLedger,
	fullProjection,
	nextContextProjection,
	observationTokenSum,
	reflectionTokenSum,
	sourceEntryCountSinceObservationCoverage,
	sourceEntryCountSinceReflectionReviewCoverage,
	type AgentUsageTotals,
	type Entry,
} from "../session-ledger/index.js";

function pct(current: number, total: number): number {
	return total > 0 ? Math.round((current / total) * 100) : 0;
}

function money(value: number): string {
	return `$${value.toFixed(value < 1 ? 4 : 2)}`;
}

function usageLine(label: string, usage: AgentUsageTotals): string {
	return `${label}: ${money(usage.cost)} / ${usage.requests.toLocaleString()} request${usage.requests === 1 ? "" : "s"} / ${usage.totalTokens.toLocaleString()} tokens`;
}

function firstArg(args: unknown): string | undefined {
	if (Array.isArray(args)) return typeof args[0] === "string" ? args[0] : undefined;
	if (typeof args === "string") return args.trim().split(/\s+/)[0] || undefined;
	if (args && typeof args === "object" && "mode" in args) {
		const mode = (args as { mode?: unknown }).mode;
		return typeof mode === "string" ? mode : undefined;
	}
	return undefined;
}

export async function runStatusCommand(args: unknown, ctx: any, runtime: Runtime): Promise<void> {
	runtime.ensureConfig(ctx.cwd);
	const mode = firstArg(args);
	if (mode && mode !== "full") {
		ctx.ui.notify("Usage: /om:status [full]", "info");
		return;
	}

	const entries = ctx.sessionManager.getBranch() as Entry[];
	const folded = foldLedger(entries);
	const context = contextProjection(entries);
	const full = fullProjection(entries);
	const nextContext = nextContextProjection(entries, full);
	const drift = diffContextProjection(context, nextContext);
	const memoryUsage = foldAgentUsage(entries);

	const contextTokens = observationTokenSum(context.observations) + reflectionTokenSum(context.reflections);
	const obsProgress = sourceEntryCountSinceObservationCoverage(entries);
	const reflectionProgress = observationsSinceReflectionCoverage(entries, folded.activeObservations).length;

	const lines = [
		"── Memory ──",
		`Context:      ${context.observations.length.toLocaleString()} observations, ${context.reflections.length.toLocaleString()} reflections`,
		`Next context: ${nextContext.observations.length.toLocaleString()} observations, ${nextContext.reflections.length.toLocaleString()} reflections`,
		`Size:         ~${contextTokens.toLocaleString()} / ${runtime.config.observationsPoolMaxTokens.toLocaleString()} tokens`,
		"",
		"── Next work ──",
		`Observe: ${obsProgress.toLocaleString()} / ${runtime.config.observeEveryMessages.toLocaleString()} source entries`,
		`Reflect: ${reflectionProgress.toLocaleString()} / ${runtime.config.reflectEveryObservations.toLocaleString()} observations`,
		"",
		"── Cost ──",
		usageLine("Total", memoryUsage.total),
	];

	if (mode === "full") {
		const activeObservationPool = observationPoolMetrics(folded.activeObservations, runtime.config.dropWhenActiveObservationsOver);
		const reflectionReviewDistance = sourceEntryCountSinceReflectionReviewCoverage(entries);
		lines.push(
			"",
			"── Details ──",
			`Strategy: ${runtime.config.strategy}`,
			`Ledger observations: ${folded.observations.length.toLocaleString()} recorded / ${folded.droppedObservationIds.size.toLocaleString()} dropped / ${folded.activeObservations.length.toLocaleString()} active`,
			`Review state: ${nextContext.reviewed.length.toLocaleString()} reviewed / ${nextContext.unreviewed.length.toLocaleString()} unreviewed`,
			`Context drift: +${drift.observationsOnlyInNextContext.length.toLocaleString()} observations, +${drift.reflectionsOnlyInNextContext.length.toLocaleString()} reflections, -${drift.observationsOnlyInContext.length.toLocaleString()} stale observations`,
			`Observation pool: ${activeObservationPool.activeObservationCount.toLocaleString()} / ${runtime.config.dropWhenActiveObservationsOver.toLocaleString()} active observations (${pct(activeObservationPool.activeObservationCount, runtime.config.dropWhenActiveObservationsOver)}%)`,
			`Drop protected recent: ${(runtime.config.protectRecentObservations ?? 20).toLocaleString()} observations`,
			`Source entries since review cursor: ${reflectionReviewDistance.toLocaleString()}`,
			"",
			"── Agent cost ──",
			usageLine("Observer", memoryUsage.observer),
			usageLine("Reflector", memoryUsage.reflector),
			usageLine("Dropper", memoryUsage.dropper),
			...(memoryUsage.unknown.requests > 0 ? [usageLine("Unknown", memoryUsage.unknown)] : []),
		);
	}

	if (runtime.memoryUpdateInFlight || runtime.compactHookInFlight) {
		lines.push("", "── In flight ──");
		if (runtime.memoryUpdateInFlight) {
			const phase = runtime.memoryUpdatePhase ? ` (${runtime.memoryUpdatePhase})` : "";
			lines.push(`Memory update: running${phase}`);
		}
		if (runtime.compactHookInFlight) lines.push("Compaction hook: running");
	}

	if (runtime.lastObserverError || runtime.lastReflectorError || runtime.lastDropperError) {
		lines.push("", "── Last error ──");
		if (runtime.lastObserverError) lines.push(`Observer: ${runtime.lastObserverError}`);
		if (runtime.lastReflectorError) lines.push(`Reflector: ${runtime.lastReflectorError}`);
		if (runtime.lastDropperError) lines.push(`Dropper: ${runtime.lastDropperError}`);
	}

	ctx.ui.notify(lines.join("\n"), "info");
}

export function registerStatusCommand(pi: ExtensionAPI, runtime: Runtime): void {
	pi.registerCommand("om:status", {
		description: "Show observational memory status",
		handler: async (args, ctx) => runStatusCommand(args, ctx, runtime),
	});
}
