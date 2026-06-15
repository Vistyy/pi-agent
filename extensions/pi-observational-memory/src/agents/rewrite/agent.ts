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
	retiredReflectionIds: string[];
	newReflectionIds: string[];
	retainedSourceIds: string[];
	discardedReflectionIds: string[];
	discardedSummary: string;
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

const MarkNoRewritesSchema = Type.Object({});
const RecordRewrittenReflectionsSchema = Type.Object({
	reflections: Type.Array(Type.Object({
		content: Type.String({ minLength: 1 }),
		sources: Type.Array(Type.String({ minLength: 1 }), { minItems: 1 }),
	}), { minItems: 1, maxItems: MAX_REWRITTEN_REFLECTIONS }),
	discardedSummary: Type.String({ minLength: 1 }),
});

type MarkNoRewritesArgs = Static<typeof MarkNoRewritesSchema>;
type RecordRewrittenReflectionsArgs = Static<typeof RecordRewrittenReflectionsSchema>;

function normalizeReflectionContent(content: string): string | undefined {
	const normalized = truncateRecordContent(content.trim());
	if (!normalized || /\r|\n/.test(normalized)) return undefined;
	return normalized;
}

function sourceIdsForRewriteInput(reflections: readonly Reflection[]): string[] {
	const ids: string[] = [];
	const seen = new Set<string>();
	for (const reflection of reflections) {
		for (const id of [reflection.id, ...reflection.sources]) {
			if (seen.has(id)) continue;
			seen.add(id);
			ids.push(id);
		}
	}
	return ids;
}

export async function runRewrite(args: RunRewriteArgs): Promise<RewriteResult | undefined> {
	const { model, apiKey, headers, reflections, signal } = args;
	if (reflections.length === 0) return undefined;

	const allowedSourceIds = sourceIdsForRewriteInput(reflections);
	const retiredReflectionIds = reflections.map((reflection) => reflection.id);
	const accumulated = new Map<string, Reflection>();
	let markedNoRewrite = false;
	let rejected = 0;
	let discardedSummary = "";

	const markNoRewrites: AgentTool<typeof MarkNoRewritesSchema> = {
		name: "mark_no_rewrites",
		label: "Mark no rewrite",
		description: "Mark active reflections as already compact enough. This tool call terminates the run.",
		parameters: MarkNoRewritesSchema,
		execute: async (_id, _params: MarkNoRewritesArgs) => {
			markedNoRewrite = true;
			return { content: [{ type: "text", text: "Marked no rewrite." }], details: { rewritten: false }, terminate: true };
		},
	};

	const recordRewrittenReflections: AgentTool<typeof RecordRewrittenReflectionsSchema> = {
		name: "record_rewritten_reflections",
		label: "Record rewritten reflections",
		description: "Record one complete compact replacement set of active reflections with source ids. This tool call terminates the run.",
		parameters: RecordRewrittenReflectionsSchema,
		execute: async (_id, params: RecordRewrittenReflectionsArgs) => {
			discardedSummary = normalizeReflectionContent(params.discardedSummary) ?? "";
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

	const userText = `CURRENT ACTIVE REFLECTIONS:\n${joinOrEmpty(reflections.map(reflectionToSummaryLine))}\n\nRewrite these into a smaller current active memory set. Call record_rewritten_reflections once, or mark_no_rewrites if no safe compression is possible.`;
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
		tools: [recordRewrittenReflections as AgentTool<any>, markNoRewrites as AgentTool<any>],
		agentName: "rewrite",
		onUsage: args.onUsage,
	});

	if (markedNoRewrite || accumulated.size === 0 || !discardedSummary) {
		debugLog("rewrite.result", { reason: markedNoRewrite ? "marked_no_rewrite" : "empty_or_invalid", acceptedCount: accumulated.size, rejected });
		return undefined;
	}
	const rewritten = Array.from(accumulated.values());
	const retainedSourceIds = Array.from(new Set(rewritten.flatMap((reflection) => reflection.sources)));
	return {
		reflections: rewritten,
		retiredReflectionIds,
		newReflectionIds: rewritten.map((reflection) => reflection.id),
		retainedSourceIds,
		discardedReflectionIds: retiredReflectionIds.filter((id) => !retainedSourceIds.includes(id)),
		discardedSummary,
	};
}
