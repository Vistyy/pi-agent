import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { STRATEGY } from "../config.js";
import { debugSessionMetadata, withDebugLogContext } from "../debug-log.js";
import type { Runtime } from "../runtime.js";
import type { Entry } from "../session-ledger/index.js";
import { anyMemoryUpdateStageDue } from "./due.js";
import { runMemoryUpdate } from "./run.js";
import type { MemoryUpdateCtx } from "./types.js";

export function registerMemoryUpdateHook(pi: ExtensionAPI, runtime: Runtime): void {
	const launch = (_event: unknown, ctx: MemoryUpdateCtx) => {
		maybeLaunchMemoryUpdate(pi, runtime, ctx);
	};
	pi.on("agent_start", launch);
	pi.on("message_end", launch);
	pi.on("turn_end", launch);
}

function maybeLaunchMemoryUpdate(pi: ExtensionAPI, runtime: Runtime, ctx: MemoryUpdateCtx): void {
	runtime.ensureConfig(ctx.cwd);
	if (runtime.config.strategy === STRATEGY.off) return;
	if (runtime.memoryUpdateInFlight) return;

	const entries = ctx.sessionManager.getBranch() as Entry[];
	if (!anyMemoryUpdateStageDue(entries, runtime)) return;

	const runId = `memory-update-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 8)}`;
	const sessionMetadata = debugSessionMetadata(ctx);
	void runtime.launchMemoryUpdateTask(ctx, async () => withDebugLogContext({
		enabled: runtime.config.debugLog === true,
		cwd: ctx.cwd,
		...sessionMetadata,
		runId,
	}, async () => {
		await runMemoryUpdate(pi, runtime, ctx);
	}));
}
