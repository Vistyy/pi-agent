import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { Runtime } from "../runtime.js";
import {
	activeReflections,
	foldLedger,
	reflectionTokenSum,
	sourceEntriesAfterIndex,
	type Entry,
} from "../session-ledger/index.js";

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
	const contextTokens = reflectionTokenSum(reflections);
	const obsProgress = sourceEntriesAfterIndex(entries, folded.lastObservationCoverageIndex).length;
	const reflectionProgress = folded.unreflectedObservations.length;
	const lines = [
		"── Memory ──",
		`Context:      ${reflections.length.toLocaleString()} reflections`,
		`Size:         ~${contextTokens.toLocaleString()} context tokens; active reflections ~${contextTokens.toLocaleString()} / ${runtime.config.reflectionsPoolMaxTokens.toLocaleString()} rewrite tokens`,
		"",
		"── Next work ──",
		`Observe: ${obsProgress.toLocaleString()} / ${runtime.config.observeEveryMessages.toLocaleString()} source entries`,
		`Reflect: ${reflectionProgress.toLocaleString()} / ${runtime.config.reflectEveryObservations.toLocaleString()} observations`,
	];

	if (mode === "full") {
		lines.push(
			"",
			"── Details ──",
			`Strategy: ${runtime.config.strategy}`,
			`Ledger observations: ${folded.observations.length.toLocaleString()} recorded`,
			`Source entries since reflection cursor: ${sourceEntriesAfterIndex(entries, folded.lastReflectionCoverageIndex).length.toLocaleString()}`,
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
