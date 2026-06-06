import type { BeforeAgentStartEvent, BeforeAgentStartEventResult, ExtensionAPI, ExtensionContext, ExtensionHandler } from "@earendil-works/pi-coding-agent";

import type { Runtime } from "../runtime.js";
import { fullProjection, renderMemoryPatch, type Entry } from "../session-ledger/index.js";

function hasCompaction(entries: readonly Entry[]): boolean {
	return entries.some((entry) => entry.type === "compaction");
}

export function registerAdditiveContext(pi: ExtensionAPI, runtime: Runtime): void {
	const handler: ExtensionHandler<BeforeAgentStartEvent, BeforeAgentStartEventResult> = (event: BeforeAgentStartEvent, ctx: ExtensionContext) => {
		runtime.ensureConfig(ctx.cwd);
		if (!runtime.config.additivePatch) return;

		const entries = ctx.sessionManager.getBranch() as Entry[] | undefined;
		if (!entries?.length || !hasCompaction(entries)) return;

		const projection = fullProjection(entries);
		const patch = renderMemoryPatch(projection.reflections, projection.observations, {
			maxTokens: runtime.config.additivePatchMaxTokens,
		});
		if (!patch) return;

		return {
			systemPrompt: `${event.systemPrompt}\n\n${patch}`,
		};
	};
	pi.on("before_agent_start", handler);
}
