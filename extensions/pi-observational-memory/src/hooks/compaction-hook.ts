import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { STRATEGY } from "../config.js";
import { ensureObservedBeforeCompaction } from "../memory-update/compaction.js";
import { getCompactionTransientMemory, resetCompactionTransientMemory } from "../memory-update/compaction-state.js";
import type { Runtime } from "../runtime.js";
import { buildNextCompactionProjection, renderSummary, type Entry } from "../session-ledger/index.js";

const DEFAULT_OBSERVATIONS_POOL_MAX_TOKENS = 20_000;

function observationsPoolMaxTokens(runtime: Runtime): number {
	const value = (runtime.config as { observationsPoolMaxTokens?: unknown }).observationsPoolMaxTokens;
	return typeof value === "number" && Number.isFinite(value) && value > 0
		? value
		: DEFAULT_OBSERVATIONS_POOL_MAX_TOKENS;
}

export function registerCompactionHook(pi: ExtensionAPI, runtime: Runtime): void {
	pi.on("session_before_compact", async (event: any, ctx: any) => {
		if (runtime.compactHookInFlight) {
			if (ctx.hasUI) {
				ctx.ui.notify(
					"Observational memory: another compaction is already in progress; cancelling duplicate",
					"warning",
				);
			}
			return { cancel: true };
		}

		runtime.compactHookInFlight = true;
		try {
			resetCompactionTransientMemory(runtime);
			runtime.ensureConfig(ctx.cwd);
			if (runtime.config.strategy === STRATEGY.off) return;
			const { preparation } = event;
			const { firstKeptEntryId, tokensBefore } = preparation;
			await ensureObservedBeforeCompaction(pi, runtime, ctx, { firstKeptEntryId });
			if (runtime.config.strategy !== STRATEGY.replacement) return;
			const branchEntries = ctx.sessionManager.getBranch() as Entry[];
			const transient = getCompactionTransientMemory(runtime);
			const projection = buildNextCompactionProjection(
				branchEntries,
				firstKeptEntryId,
				{ observationsPoolMaxTokens: observationsPoolMaxTokens(runtime) },
				transient,
			);
			const summary = renderSummary(projection.reflections, projection.observations);

			return {
				compaction: {
					summary,
					firstKeptEntryId,
					tokensBefore,
					details: projection.details,
				},
			};
		} finally {
			runtime.compactHookInFlight = false;
		}
	});
}
