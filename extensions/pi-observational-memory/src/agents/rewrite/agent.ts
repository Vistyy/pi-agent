import { agentLoop, type AgentTool } from "@earendil-works/pi-agent-core";
import type { Model, ModelThinkingLevel } from "@earendil-works/pi-ai";
import { Type } from "@earendil-works/pi-ai";
import type { Static } from "typebox";
import { debugLog } from "../../debug-log.js";
import { hashId, reflectionId } from "../../memory/ids.js";
import { truncateRecordContent } from "../../memory/record-content.js";
import { estimateStringTokens } from "../../memory/token-estimate.js";
import { reflectionToSummaryLine, type Reflection } from "../../session-ledger/index.js";
import { joinOrEmpty, normalizeAllowedIdsStrict, runMemoryAgentLoop, type MemoryAgentUsage } from "../common.js";
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

const MAX_REWRITTEN_REFLECTIONS = 30;

const RecordRewrittenReflectionsSchema = Type.Object({
	reflections: Type.Array(Type.Object({
		content: Type.String({ minLength: 1 }),
		sources: Type.Array(Type.String({ minLength: 1 }), { minItems: 1 }),
	}), { maxItems: MAX_REWRITTEN_REFLECTIONS }),
	summary: Type.Optional(Type.String({ minLength: 1 })),
});

type RecordRewrittenReflectionsArgs = Static<typeof RecordRewrittenReflectionsSchema>;

function normalizeReflectionContent(content: string): string | undefined {
	const normalized = truncateRecordContent(content.trim());
	if (!normalized || /\r|\n/.test(normalized)) return undefined;
	return normalized;
}

export async function runRewrite(args: RunRewriteArgs): Promise<RewriteResult | undefined> {
	const { model, apiKey, headers, reflections, signal } = args;
	if (reflections.length === 0) return undefined;

	const allowedSourceIds = Array.from(new Set(reflections.flatMap((reflection) => [reflection.id, ...reflection.sources])));
	const accumulated = new Map<string, Reflection>();
	let rejected = 0;
	let summary: string | undefined;
	let called = false;

	const recordRewrittenReflections: AgentTool<typeof RecordRewrittenReflectionsSchema> = {
		name: "record_rewritten_reflections",
		label: "Record rewritten reflections",
		description: "Record one complete compact replacement set of active reflections with source ids. Use an empty reflections array when no safe rewrite is possible. This tool call terminates the run.",
		parameters: RecordRewrittenReflectionsSchema,
		execute: async (_id, params: RecordRewrittenReflectionsArgs) => {
			called = true;
			summary = params.summary ? normalizeReflectionContent(params.summary) : undefined;
			for (const proposal of params.reflections) {
				const content = normalizeReflectionContent(proposal.content);
				const sources = normalizeAllowedIdsStrict(proposal.sources, allowedSourceIds);
				if (!content || !sources) {
					rejected++;
					continue;
				}
				const id = reflectionId(hashId(content));
				if (accumulated.has(id)) continue;
				accumulated.set(id, { id, kind: "reflection", content, sources, createdAt: new Date().toISOString() });
			}
			return { content: [{ type: "text", text: `Accepted ${accumulated.size} rewritten reflections; ${rejected} rejected.` }], details: { accepted: accumulated.size, rejected }, terminate: true };
		},
	};

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
		tools: [recordRewrittenReflections as AgentTool<any>],
		agentName: "rewrite",
		onUsage: args.onUsage,
	});

	if (!called || accumulated.size === 0) {
		debugLog("rewrite.result", { reason: called ? "empty_or_invalid" : "no_tool_call", acceptedCount: accumulated.size, rejected });
		return undefined;
	}
	return { reflections: Array.from(accumulated.values()), summary };
}
