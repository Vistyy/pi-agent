import { agentLoop, type AgentTool } from "@earendil-works/pi-agent-core";
import type { Model, ModelThinkingLevel } from "@earendil-works/pi-ai";
import { debugLog } from "../../debug-log.js";
import { estimateStringTokens } from "../../memory/token-estimate.js";
import { reflectionToSummaryLine, type Reflection } from "../../session-ledger/index.js";
import { joinOrEmpty, runMemoryAgentLoop, type MemoryAgentUsage } from "../common.js";
import { reflectionRecordTool } from "../record-tool.js";
import { REWRITE_SYSTEM } from "./prompts.js";

export type RewriteResult = {
	reflections: Reflection[];
	summary?: string;
};

interface RunRewriteArgs {
	model: Model<any>;
	apiKey: string;
	headers?: Record<string, string>;
	reflections: Reflection[];
	signal?: AbortSignal;
	agentLoop?: typeof agentLoop;
	maxTurns?: number;
	thinkingLevel?: ModelThinkingLevel;
	onUsage?: (usage: MemoryAgentUsage) => void;
}

export async function runRewrite(args: RunRewriteArgs): Promise<RewriteResult | undefined> {
	const { model, apiKey, headers, reflections, signal } = args;
	if (reflections.length === 0) return undefined;

	const allowedSourceIds = Array.from(new Set(reflections.flatMap((reflection) => [reflection.id, ...reflection.sources])));
	const recorder = reflectionRecordTool({
		name: "record_rewritten_reflections",
		label: "Record rewritten reflections",
		description: "Record one complete compact replacement set of active reflections with source ids. Use an empty reflections array when no safe rewrite is possible. This tool call terminates the run.",
		allowedSourceIds,
		allowSummary: true,
		ackVerb: "Accepted",
	});

	const userText = `CURRENT ACTIVE REFLECTIONS:\n${joinOrEmpty(reflections.map(reflectionToSummaryLine))}\n\nRewrite these into a smaller current active memory set. Call record_rewritten_reflections once with compact replacements, or with an empty reflections array if no safe compression is possible.`;
	debugLog("rewrite.prompt", { reflectionCount: reflections.length, allowedSourceIdCount: allowedSourceIds.length, userTextTokenEstimate: estimateStringTokens(userText) });
	await runMemoryAgentLoop({
		model,
		apiKey,
		headers,
		signal,
		agentLoop: args.agentLoop,
		maxTurns: args.maxTurns,
		thinkingLevel: args.thinkingLevel,
		systemPrompt: REWRITE_SYSTEM,
		userText,
		tools: [recorder.tool as AgentTool<any>],
		agentName: "rewrite",
		onUsage: args.onUsage,
	});

	const accepted = recorder.accepted();
	if (!recorder.called() || accepted.length === 0) {
		debugLog("rewrite.result", { reason: recorder.called() ? "empty_or_invalid" : "no_tool_call", acceptedCount: accepted.length, rejected: recorder.rejected() });
		return undefined;
	}
	return { reflections: accepted, summary: recorder.summary() };
}
