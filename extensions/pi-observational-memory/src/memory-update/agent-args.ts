import type { ModelThinkingLevel } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { Runtime } from "../runtime.js";
import type { ResolvedModel } from "./types.js";

export function commonAgentArgs(_pi: ExtensionAPI, runtime: Runtime, resolved: ResolvedModel, thinkingOverride?: ModelThinkingLevel) {
	return {
		model: resolved.model as any,
		apiKey: resolved.apiKey,
		headers: resolved.headers,
		maxTurns: runtime.config.agentMaxTurns,
		thinkingLevel: thinkingOverride ?? runtime.config.model?.thinking ?? "low",
	};
}
