import type { ModelThinkingLevel } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { buildUsageRecordedData, PI_USAGE_RECORDED } from "../../../pi-cost/src/types.js";
import type { MemoryAgentUsage } from "../agents/common.js";
import type { Runtime } from "../runtime.js";
import type { ResolvedModel } from "./types.js";

function operationFor(runtime: Runtime, usage: MemoryAgentUsage): string {
	return usage.agent === "observer" && runtime.compactHookInFlight ? "compaction-flush" : "memory-update";
}

export function commonAgentArgs(pi: ExtensionAPI, runtime: Runtime, resolved: ResolvedModel, thinkingOverride?: ModelThinkingLevel) {
	return {
		model: resolved.model as any,
		apiKey: resolved.apiKey,
		headers: resolved.headers,
		maxTurns: runtime.config.agentMaxTurns,
		thinkingLevel: thinkingOverride ?? runtime.config.model?.thinking ?? "low",
		onUsage: (usage: MemoryAgentUsage) => {
			pi.appendEntry(PI_USAGE_RECORDED, buildUsageRecordedData({
				extension: "om",
				agent: usage.agent,
				operation: operationFor(runtime, usage),
				model: usage.model,
				usage: usage.usage,
			}));
		},
	};
}
