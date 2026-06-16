import { agentLoop, type AgentTool } from "@earendil-works/pi-agent-core";
import type { Model, ModelThinkingLevel } from "@earendil-works/pi-ai";
import { Type } from "@earendil-works/pi-ai";
import type { Static } from "typebox";
import { debugLog } from "../../debug-log.js";
import { hashId, reflectionId } from "../../memory/ids.js";
import { joinOrEmpty, normalizeAllowedIdsStrict, runMemoryAgentLoop, type MemoryAgentUsage } from "../common.js";
import { truncateRecordContent } from "../../memory/record-content.js";
import { REFLECTOR_SYSTEM } from "./prompts.js";
import { estimateStringTokens } from "../../memory/token-estimate.js";
import { observationToSummaryLine, reflectionToSummaryLine, type Observation, type Reflection } from "../../session-ledger/index.js";

interface RunReflectorArgs {
	model: Model<any>;
	apiKey: string;
	headers?: Record<string, string>;
	reflections: Reflection[];
	observations: Observation[];
	signal?: AbortSignal;
	agentLoop?: typeof agentLoop;
	maxTurns?: number;
	thinkingLevel?: ModelThinkingLevel;
	onUsage?: (usage: MemoryAgentUsage) => void;
}

const RecordReflectionsSchema = Type.Object({
	reflections: Type.Array(
		Type.Object({
			content: Type.String({ minLength: 1 }),
			sources: Type.Array(Type.String({ minLength: 1 }), { minItems: 1 }),
		}),
		{},
	),
});

type RecordReflectionsArgs = Static<typeof RecordReflectionsSchema>;

export function summarizeSupportIdCounts(reflections: readonly Reflection[]): {
	reflectionCount: number;
	totalSupportIds: number;
	minSupportIds: number;
	maxSupportIds: number;
	averageSupportIds: number;
	histogram: Record<string, number>;
} {
	if (reflections.length === 0) {
		return { reflectionCount: 0, totalSupportIds: 0, minSupportIds: 0, maxSupportIds: 0, averageSupportIds: 0, histogram: {} };
	}
	const counts = reflections.map((reflection) => reflection.sources.length);
	const totalSupportIds = counts.reduce((sum, count) => sum + count, 0);
	const histogram: Record<string, number> = {};
	for (const count of counts) histogram[String(count)] = (histogram[String(count)] ?? 0) + 1;
	return {
		reflectionCount: reflections.length,
		totalSupportIds,
		minSupportIds: Math.min(...counts),
		maxSupportIds: Math.max(...counts),
		averageSupportIds: totalSupportIds / reflections.length,
		histogram,
	};
}

export const normalizeSourceIds = normalizeAllowedIdsStrict;

function normalizeReflectionContent(content: string): string | undefined {
	const normalized = truncateRecordContent(content.trim());
	if (!normalized || /\r|\n/.test(normalized)) return undefined;
	return normalized;
}

export async function runReflector(args: RunReflectorArgs): Promise<Reflection[] | undefined> {
	const { model, apiKey, headers, reflections, observations, signal } = args;
	if (observations.length === 0) return undefined;

	debugLog("reflector.agent_start", {
		activeObservationCount: observations.length,
		reflectionCount: reflections.length,
	});

	const allowedObservationIds = observations.map((observation) => observation.id);
	const existingReflectionIds = new Set(reflections.map((reflection) => reflection.id));
	const accumulated = new Map<string, Reflection>();
	let toolCallCount = 0;
	let rawProposedReflectionCount = 0;
	let acceptedReflectionCount = 0;
	let duplicateReflectionCount = 0;
	let rejectedReflectionCount = 0;
	let rejectedEmptyOrMultilineContentCount = 0;
	let rejectedInvalidSupportIdsCount = 0;
	let recordedEmpty = false;

	const recordReflections: AgentTool<typeof RecordReflectionsSchema> = {
		name: "record_reflections",
		label: "Record reflections",
		description: "Record one complete batch of new durable reflections with source observation ids. Use an empty reflections array when the pending observations add no durable active-memory value. This tool call terminates the run.",
		parameters: RecordReflectionsSchema,
		execute: async (_id, params: RecordReflectionsArgs) => {
			toolCallCount++;
			recordedEmpty ||= params.reflections.length === 0;
			rawProposedReflectionCount += params.reflections.length;
			let added = 0;
			let duplicates = 0;
			let rejected = 0;
			for (const proposal of params.reflections) {
				const content = normalizeReflectionContent(proposal.content);
				const sourceIds = normalizeSourceIds(proposal.sources, allowedObservationIds);
				if (!content || !sourceIds) {
					rejected++;
					if (!content) rejectedEmptyOrMultilineContentCount++;
					if (!sourceIds) rejectedInvalidSupportIdsCount++;
					continue;
				}
				const id = reflectionId(hashId(content));
				if (existingReflectionIds.has(id) || accumulated.has(id)) {
					duplicates++;
					continue;
				}
				accumulated.set(id, {
					id,
					kind: "reflection",
					content,
					sources: sourceIds,
					createdAt: new Date().toISOString(),
				});
				added++;
			}
			acceptedReflectionCount += added;
			duplicateReflectionCount += duplicates;
			rejectedReflectionCount += rejected;
			return {
				content: [{ type: "text", text: `Recorded ${added} reflection${added === 1 ? "" : "s"}; ${duplicates} duplicate${duplicates === 1 ? "" : "s"}; ${rejected} rejected. Total this run: ${accumulated.size}.` }],
				details: { added, duplicates, rejected, total: accumulated.size },
				terminate: true,
			};
		},
	};

	const userText = `CURRENT REFLECTIONS:\n${joinOrEmpty(reflections.map(reflectionToSummaryLine))}\n\nPENDING OBSERVATIONS:\n${joinOrEmpty(observations.map(observationToSummaryLine))}\n\nSynthesize the pending observations into active memory. Call record_reflections once with every durable new reflection, or with an empty reflections array if the pending observations add no durable active-memory value.`;
	debugLog("reflector.prompt", {
		reflectionCount: reflections.length,
		observationCount: observations.length,
		userTextTokenEstimate: estimateStringTokens(userText),
	});
	await runMemoryAgentLoop({
		model,
		apiKey,
		headers,
		signal,
		agentLoop: args.agentLoop,
		maxTurns: args.maxTurns,
		thinkingLevel: args.thinkingLevel,
		systemPrompt: REFLECTOR_SYSTEM,
		userText,
		tools: [recordReflections as AgentTool<any>],
		agentName: "reflector",
		onUsage: args.onUsage,
	});
	const acceptedReflections = Array.from(accumulated.values());
	debugLog("reflector.result", {
		reason: acceptedReflections.length > 0 ? "accepted_nonempty" : recordedEmpty ? "recorded_empty" : toolCallCount === 0 ? "no_tool_call" : "all_filtered",
		toolCallCount,
		rawProposedReflectionCount,
		acceptedReflectionCount,
		duplicateReflectionCount,
		rejectedReflectionCount,
		rejectedEmptyOrMultilineContentCount,
		rejectedInvalidSupportIdsCount,
		acceptedSupportIdCounts: summarizeSupportIdCounts(acceptedReflections),
	});
	if (acceptedReflections.length > 0) return acceptedReflections;
	return recordedEmpty ? [] : undefined;
}
