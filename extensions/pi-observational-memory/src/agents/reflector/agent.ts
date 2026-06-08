import { agentLoop, type AgentTool } from "@earendil-works/pi-agent-core";
import type { Model, ModelThinkingLevel } from "@earendil-works/pi-ai";
import { Type } from "@earendil-works/pi-ai";
import type { Static } from "typebox";
import { debugLog } from "../../debug-log.js";
import { hashId } from "../../memory/ids.js";
import { joinOrEmpty, normalizeAllowedIdsStrict, runMemoryAgentLoop } from "../common.js";
import { truncateRecordContent } from "../../memory/serialize.js";
import { REFLECTOR_SYSTEM } from "./prompts.js";
import { estimateStringTokens } from "../../memory/token-estimate.js";
import { reflectionToSummaryLine, type Observation, type Reflection } from "../../session-ledger/index.js";
import {
	coverageTierForObservation,
	observationToMemoryAgentLine,
	reflectionCoverageMap,
	summarizeCoverage,
	summarizeCoverageTransitions,
} from "../coverage.js";
export { observationToMemoryAgentLine } from "../coverage.js";

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
}

const MarkReviewedNoReflectionsSchema = Type.Object({});

const RecordReflectionsSchema = Type.Object({
	reflections: Type.Array(
		Type.Object({
			content: Type.String({ minLength: 1 }),
			supportingObservationIds: Type.Array(Type.String({ minLength: 1 }), { minItems: 1 }),
		}),
		{ minItems: 1 },
	),
});

type MarkReviewedNoReflectionsArgs = Static<typeof MarkReviewedNoReflectionsSchema>;
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
	const counts = reflections.map((reflection) => reflection.supportingObservationIds.length);
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

export const normalizeSupportingObservationIds = normalizeAllowedIdsStrict;

function normalizeReflectionContent(content: string): string | undefined {
	const normalized = truncateRecordContent(content.trim());
	if (!normalized || /\r|\n/.test(normalized)) return undefined;
	return normalized;
}

export async function runReflector(args: RunReflectorArgs): Promise<Reflection[] | undefined> {
	const { model, apiKey, headers, reflections, observations, signal } = args;
	if (observations.length === 0) return undefined;

	const coverageById = reflectionCoverageMap(observations, reflections);
	debugLog("reflector.agent_start", {
		activeObservationCount: observations.length,
		reflectionCount: reflections.length,
		coverageSummary: summarizeCoverage(observations, coverageById),
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
	let reviewedNoReflectionsCallCount = 0;

	const markReviewedNoReflections: AgentTool<typeof MarkReviewedNoReflectionsSchema> = {
		name: "mark_reviewed_no_reflections",
		label: "Mark reviewed",
		description: "Mark this observation set reviewed when no durable reflections should be added. This tool call terminates the run.",
		parameters: MarkReviewedNoReflectionsSchema,
		execute: async (_id, _params: MarkReviewedNoReflectionsArgs) => {
			reviewedNoReflectionsCallCount++;
			return {
				content: [{ type: "text", text: "Marked reviewed with no new reflections." }],
				details: { reviewed: true },
				terminate: true,
			};
		},
	};

	const recordReflections: AgentTool<typeof RecordReflectionsSchema> = {
		name: "record_reflections",
		label: "Record reflections",
		description: "Record one complete batch of new durable reflections with supporting observation ids. This tool call terminates the run.",
		parameters: RecordReflectionsSchema,
		execute: async (_id, params: RecordReflectionsArgs) => {
			toolCallCount++;
			rawProposedReflectionCount += params.reflections.length;
			let added = 0;
			let duplicates = 0;
			let rejected = 0;
			for (const proposal of params.reflections) {
				const content = normalizeReflectionContent(proposal.content);
				const supportingObservationIds = normalizeSupportingObservationIds(proposal.supportingObservationIds, allowedObservationIds);
				if (!content || !supportingObservationIds) {
					rejected++;
					if (!content) rejectedEmptyOrMultilineContentCount++;
					if (!supportingObservationIds) rejectedInvalidSupportIdsCount++;
					continue;
				}
				const id = hashId(content);
				if (existingReflectionIds.has(id) || accumulated.has(id)) {
					duplicates++;
					continue;
				}
				accumulated.set(id, {
					id,
					content,
					supportingObservationIds,
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

	const userText = `CURRENT REFLECTIONS:\n${joinOrEmpty(reflections.map(reflectionToSummaryLine))}\n\nCURRENT OBSERVATIONS:\n${joinOrEmpty(observations.map((observation) => observationToMemoryAgentLine(observation, coverageTierForObservation(observation, coverageById))))}\n\nReview these observations. Call record_reflections once with every durable new reflection, or mark_reviewed_no_reflections if none should be added.`;
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
		tools: [recordReflections as AgentTool<any>, markReviewedNoReflections as AgentTool<any>],
		agentName: "reflector",
	});
	const acceptedReflections = Array.from(accumulated.values());
	const afterCoverageById = reflectionCoverageMap(observations, [...reflections, ...acceptedReflections]);
	debugLog("reflector.result", {
		reason: acceptedReflections.length > 0 ? "accepted_nonempty" : reviewedNoReflectionsCallCount > 0 ? "reviewed_no_reflections" : toolCallCount === 0 ? "no_tool_call" : "all_filtered",
		toolCallCount,
		reviewedNoReflectionsCallCount,
		rawProposedReflectionCount,
		acceptedReflectionCount,
		duplicateReflectionCount,
		rejectedReflectionCount,
		rejectedEmptyOrMultilineContentCount,
		rejectedInvalidSupportIdsCount,
		acceptedSupportIdCounts: summarizeSupportIdCounts(acceptedReflections),
		coverageTransitions: summarizeCoverageTransitions(observations, coverageById, afterCoverageById),
	});
	if (acceptedReflections.length > 0) return acceptedReflections;
	return reviewedNoReflectionsCallCount > 0 ? [] : undefined;
}
