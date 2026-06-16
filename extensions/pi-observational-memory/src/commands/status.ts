import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { observationsSinceReflectionCoverage } from "../memory-update/stage-utils.js";
import type { Runtime } from "../runtime.js";
import {
	activeReflections,
	foldAgentUsage,
	foldLedger,
	reflectionTokenSum,
	sourceEntryCountSinceObservationCoverage,
	sourceEntryCountSinceReflectionReviewCoverage,
	type AgentUsageTotals,
	type Entry,
} from "../session-ledger/index.js";

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
	const reflections = activeReflections(entries);
	const memoryUsage = foldAgentUsage(entries);

	const contextTokens = reflectionTokenSum(reflections);
	const activeReflectionTokens = reflectionTokenSum(reflections);
	const obsProgress = sourceEntryCountSinceObservationCoverage(entries);
	const reflectionProgress = observationsSinceReflectionCoverage(entries, folded.observations).length;
	const lines = [
		"── Memory ──",
		`Context:      ${reflections.length.toLocaleString()} reflections`,
		`Size:         ~${contextTokens.toLocaleString()} context tokens; active reflections ~${activeReflectionTokens.toLocaleString()} / ${runtime.config.reflectionsPoolMaxTokens.toLocaleString()} rewrite tokens`,
		"",
		"── Next work ──",
		`Observe: ${obsProgress.toLocaleString()} / ${runtime.config.observeEveryMessages.toLocaleString()} source entries`,
		`Reflect: ${reflectionProgress.toLocaleString()} / ${runtime.config.reflectEveryObservations.toLocaleString()} observations`,
		"",
		"── Cost ──",
		usageLine("Total", memoryUsage.total),
	];

	if (mode === "full") {
		const reflectionReviewDistance = sourceEntryCountSinceReflectionReviewCoverage(entries);
		lines.push(
			"",
			"── Details ──",
			`Strategy: ${runtime.config.strategy}`,
			`Ledger observations: ${folded.observations.length.toLocaleString()} recorded`,
			`Source entries since review cursor: ${reflectionReviewDistance.toLocaleString()}`,
			"",
			"── Agent cost ──",
			usageLine("Observer", memoryUsage.observer),
			usageLine("Reflector", memoryUsage.reflector),
			usageLine("Rewrite", memoryUsage.rewrite),
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

	if (runtime.lastObserverError || runtime.lastReflectorError) {
		lines.push("", "── Last error ──");
		if (runtime.lastObserverError) lines.push(`Observer: ${runtime.lastObserverError}`);
		if (runtime.lastReflectorError) lines.push(`Reflector: ${runtime.lastReflectorError}`);
	}

	ctx.ui.notify(lines.join("\n"), "info");
}

export function registerStatusCommand(pi: ExtensionAPI, runtime: Runtime): void {
	pi.registerCommand("om:status", {
		description: "Show observational memory status",
		handler: async (args, ctx) => runStatusCommand(args, ctx, runtime),
	});
}
