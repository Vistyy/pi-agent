import { agentLoop, type AgentTool } from "@earendil-works/pi-agent-core";
import type { Model, ModelThinkingLevel } from "@earendil-works/pi-ai";
import { Type } from "@earendil-works/pi-ai";
import type { Static } from "typebox";
import { debugLog } from "../../debug-log.js";
import { hashId, reflectionId } from "../../memory/ids.js";
import { normalizeReflectionContent } from "../reflection-content.js";
import { joinOrEmpty, normalizeAllowedIdsStrict, runMemoryAgentLoop, type MemoryAgentUsage } from "../common.js";
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

export const normalizeSourceIds = normalizeAllowedIdsStrict;

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
	let toolCalled = false;
	let recordedEmpty = false;

	const recordReflections: AgentTool<typeof RecordReflectionsSchema> = {
		name: "record_reflections",
		label: "Record reflections",
		description: "Record one complete batch of new durable reflections with source observation ids. Use an empty reflections array when the pending observations add no durable active-memory value. This tool call terminates the run.",
		parameters: RecordReflectionsSchema,
		execute: async (_id, params: RecordReflectionsArgs) => {
			toolCalled = true;
			recordedEmpty ||= params.reflections.length === 0;
			let added = 0;
			let duplicates = 0;
			let rejected = 0;
			for (const proposal of params.reflections) {
				const content = normalizeReflectionContent(proposal.content);
				const sourceIds = normalizeSourceIds(proposal.sources, allowedObservationIds);
				if (!content || !sourceIds) {
					rejected++;
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
		reason: acceptedReflections.length > 0 ? "accepted_nonempty" : recordedEmpty ? "recorded_empty" : toolCalled ? "all_filtered" : "no_tool_call",
		acceptedCount: acceptedReflections.length,
	});
	if (acceptedReflections.length > 0) return acceptedReflections;
	return recordedEmpty ? [] : undefined;
}
