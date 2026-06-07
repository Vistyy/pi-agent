import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { observationPoolMetrics } from "../agents/dropper/pool.js";
import type { Runtime } from "../runtime.js";
import {
	diffProjection,
	foldLedger,
	fullProjection,
	sourceEntryCountSinceObservationCoverage,
	latestCompactedProjection,
	type Entry,
} from "../session-ledger/index.js";

function pct(current: number, total: number): number {
	return total > 0 ? Math.round((current / total) * 100) : 0;
}

function tokenSum(items: { tokenCount: number }[]): number {
	return items.reduce((sum, item) => sum + item.tokenCount, 0);
}

function addedSuffix(count: number): string | undefined {
	return count > 0 ? `+${count.toLocaleString()}` : undefined;
}

function removedSuffix(count: number): string | undefined {
	return count > 0 ? `-${count.toLocaleString()}` : undefined;
}

function appendSuffixes(line: string, suffixes: (string | undefined)[]): string {
	const rendered = suffixes.filter((suffix): suffix is string => suffix !== undefined);
	return rendered.length > 0 ? `${line} ${rendered.join(" ")}` : line;
}

export function registerStatusCommand(pi: ExtensionAPI, runtime: Runtime): void {
	pi.registerCommand("om:status", {
		description: "Show observational memory status",
		handler: async (_args, ctx) => {
			runtime.ensureConfig(ctx.cwd);
			const entries = ctx.sessionManager.getBranch() as Entry[];
			const folded = foldLedger(entries);
			const visible = latestCompactedProjection(entries);
			const full = fullProjection(entries);
			const drift = diffProjection(visible, full);

			const visibleObservationTokens = tokenSum(visible.observations);
			const visibleReflectionTokens = tokenSum(visible.reflections);
			const activeObservationPool = observationPoolMetrics(folded.activeObservations, runtime.config.dropWhenActiveObservationsOver);
			const observationLine = appendSuffixes(
				`Observations: ${folded.observations.length} recorded / ${folded.droppedObservationIds.size} dropped / ${folded.activeObservations.length} active / ${visible.observations.length} visible`,
				[
					addedSuffix(drift.observationsOnlyInFull.length),
					removedSuffix(drift.droppedOnlyInFull.length),
				],
			);
			const reflectionLine = appendSuffixes(
				`Reflections:  ${folded.reflections.length} recorded / ${visible.reflections.length} visible`,
				[addedSuffix(drift.reflectionsOnlyInFull.length)],
			);
			const obsProgress = sourceEntryCountSinceObservationCoverage(entries);
			const reflectionProgress = folded.activeObservations.length;

			const modeLines = [
				"── Config ──",
				`Strategy: ${runtime.config.strategy}`,
				"",
			];

			const lines = [
				...modeLines,
				"── Memory ──",
				observationLine,
				reflectionLine,
				"",
				"── Activity ──",
				`Next observation: ${obsProgress.toLocaleString()} / ${runtime.config.observeEveryMessages.toLocaleString()} source entries (${pct(obsProgress, runtime.config.observeEveryMessages)}%)`,
				`Next reflection:  ${reflectionProgress.toLocaleString()} / ${runtime.config.reflectEveryObservations.toLocaleString()} active observations (${pct(reflectionProgress, runtime.config.reflectEveryObservations)}%)`,
				`Visible observation pool: ~${visibleObservationTokens.toLocaleString()} / ${runtime.config.observationsPoolMaxTokens.toLocaleString()} tokens (${pct(visibleObservationTokens, runtime.config.observationsPoolMaxTokens)}%)`,
				`Active observation pool: ${activeObservationPool.activeObservationCount.toLocaleString()} / ${runtime.config.dropWhenActiveObservationsOver.toLocaleString()} observations (${pct(activeObservationPool.activeObservationCount, runtime.config.dropWhenActiveObservationsOver)}%)`,
				`Reflection pool:         ~${visibleReflectionTokens.toLocaleString()} tokens`,
			];

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
		},
	});
}
