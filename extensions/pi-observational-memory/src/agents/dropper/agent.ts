import { agentLoop, type AgentTool } from "@earendil-works/pi-agent-core";
import type { Model, ModelThinkingLevel } from "@earendil-works/pi-ai";
import { Type } from "@earendil-works/pi-ai";
import type { Static } from "typebox";
import { debugLog } from "../../debug-log.js";
import { joinOrEmpty, runMemoryAgentLoop } from "../common.js";
import { reflectionToSummaryLine, type Observation, type Reflection } from "../../session-ledger/index.js";
import { DROPPER_SYSTEM } from "./prompts.js";
import {
	REFLECTION_COVERAGE_DROP_RANK,
	coverageTierForObservation,
	reflectionCoverageMap,
	summarizeCoverage,
	summarizeCoverageForIds,
	observationToMemoryAgentLine,
} from "../coverage.js";
interface RunDropperArgs {
	model: Model<any>;
	apiKey: string;
	headers?: Record<string, string>;
	reflections: Reflection[];
	observations: Observation[];
	maxDropsAllowed: number;
	protectedObservationIds?: readonly string[];
	signal?: AbortSignal;
	agentLoop?: typeof agentLoop;
	maxTurns?: number;
	thinkingLevel?: ModelThinkingLevel;
}

const DropObservationsSchema = Type.Object({
	ids: Type.Array(Type.String({ minLength: 1 }), { minItems: 1 }),
	reason: Type.Optional(Type.String()),
});

type DropObservationsArgs = Static<typeof DropObservationsSchema>;

export function normalizeDropObservationIds(
	ids: readonly string[] | undefined,
	observations: readonly Observation[],
): string[] | undefined {
	if (!ids || ids.length === 0) return undefined;
	const allowed = new Map(observations.map((observation) => [observation.id, observation]));
	const result: string[] = [];
	const seen = new Set<string>();
	for (const id of ids) {
		const observation = allowed.get(id);
		if (!observation) continue;
		if (seen.has(id)) continue;
		seen.add(id);
		result.push(id);
	}
	return result.length > 0 ? result : undefined;
}

function timestampRank(timestamp: string): number {
	const parsed = Date.parse(timestamp);
	return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
}

export function isProtectedObservation(
	observation: Observation,
	protectedObservationIds: ReadonlySet<string> = new Set(),
): boolean {
	return protectedObservationIds.has(observation.id);
}

export function selectDropCandidates(
	ids: readonly string[],
	observations: readonly Observation[],
	maxDrops: number,
	reflections: readonly Reflection[] = [],
	protectedObservationIds: readonly string[] = [],
): string[] {
	if (maxDrops <= 0 || ids.length === 0) return [];

	const byId = new Map(observations.map((observation) => [observation.id, observation]));
	const coverageById = reflectionCoverageMap(observations, reflections);
	const protectedIds = new Set(protectedObservationIds);
	const firstProposalIndex = new Map<string, number>();
	for (let i = 0; i < ids.length; i++) {
		const id = ids[i];
		if (!firstProposalIndex.has(id)) firstProposalIndex.set(id, i);
	}

	return Array.from(firstProposalIndex.entries())
		.map(([id, index]) => ({ id, index, observation: byId.get(id) }))
		.filter((candidate): candidate is { id: string; index: number; observation: Observation } =>
			candidate.observation !== undefined && !isProtectedObservation(candidate.observation, protectedIds)
		)
		.sort((a, b) => {
			const coverageDelta = REFLECTION_COVERAGE_DROP_RANK[coverageTierForObservation(a.observation, coverageById)]
				- REFLECTION_COVERAGE_DROP_RANK[coverageTierForObservation(b.observation, coverageById)];
			const ageDelta = timestampRank(a.observation.timestamp) - timestampRank(b.observation.timestamp);
			return coverageDelta || ageDelta || a.index - b.index;
		})
		.slice(0, maxDrops)
		.map((candidate) => candidate.id);
}

export async function runDropper(args: RunDropperArgs): Promise<string[] | undefined> {
	const { model, apiKey, headers, reflections, observations, maxDropsAllowed, protectedObservationIds = [], signal } = args;
	if (observations.length === 0) return undefined;

	const protectedIds = new Set(protectedObservationIds);
	const eligibleObservations = observations.filter((observation) => !protectedIds.has(observation.id));
	const observationTokens = eligibleObservations.reduce((sum, observation) => sum + observation.tokenCount, 0);
	const coverageById = reflectionCoverageMap(observations, reflections);
	const coverageSummary = summarizeCoverage(eligibleObservations, coverageById);
	debugLog("dropper.agent_start", {
		activeObservationCount: observations.length,
		eligibleObservationCount: eligibleObservations.length,
		reflectionCount: reflections.length,
		observationTokens,
		maxDropsAllowed,
		protectedObservationCount: protectedObservationIds.length,
		coverageSummary,
	});
	if (maxDropsAllowed <= 0 || eligibleObservations.length === 0) {
		debugLog("dropper.result", {
			reason: "not_over_target",
			toolCallCount: 0,
			rawRequestedIdsCount: 0,
			acceptedCandidateCount: 0,
			selectedDropsCount: 0,
			selectedDropTokens: 0,
			selectedCoverageSummary: summarizeCoverageForIds([], observations, coverageById),
			maxDropsAllowed,
		});
		return undefined;
	}

	const proposedDropIds: string[] = [];
	const proposed = new Set<string>();
	const allowed = new Map(eligibleObservations.map((observation) => [observation.id, observation]));
	let toolCallCount = 0;
	let rawRequestedIdsCount = 0;
	let missingIdsCount = 0;
	let duplicateInRequestCount = 0;
	let duplicateInRunCount = 0;

	const dropObservations: AgentTool<typeof DropObservationsSchema> = {
		name: "drop_observations",
		label: "Drop observations",
		description: "Propose active observation ids that are safe to remove from compacted memory.",
		parameters: DropObservationsSchema,
		execute: async (_id, params: DropObservationsArgs) => {
			toolCallCount++;
			rawRequestedIdsCount += params.ids.length;
			const seenInRequest = new Set<string>();
			let added = 0;
			let requestMissingIds = 0;
			let requestDuplicateIds = 0;
			let requestDuplicateInRunIds = 0;
			for (const id of params.ids) {
				const observation = allowed.get(id);
				if (!observation) {
					missingIdsCount++;
					requestMissingIds++;
					continue;
				}
				if (seenInRequest.has(id)) {
					duplicateInRequestCount++;
					requestDuplicateIds++;
					continue;
				}
				seenInRequest.add(id);
				if (proposed.has(id)) {
					duplicateInRunCount++;
					requestDuplicateInRunIds++;
					continue;
				}
				proposed.add(id);
				proposedDropIds.push(id);
				added++;
			}
			debugLog("dropper.tool_call", {
				toolCallCount,
				rawRequestedIdsCount: params.ids.length,
				acceptedIdsCount: added,
				missingIdsCount: requestMissingIds,
				duplicateInRequestCount: requestDuplicateIds,
				duplicateInRunCount: requestDuplicateInRunIds,
				totalCandidates: proposedDropIds.length,
				maxDropsAllowed,
			});
			return {
				content: [{ type: "text", text: `Queued ${added} drop candidate${added === 1 ? "" : "s"}. Candidates this run: ${proposedDropIds.length}. Maximum drops allowed: ${maxDropsAllowed}.` }],
				details: { added, totalCandidates: proposedDropIds.length, maxDropsAllowed },
			};
		},
	};

	const userText = `CURRENT REFLECTIONS:\n${joinOrEmpty(reflections.map(reflectionToSummaryLine))}\n\nELIGIBLE OBSERVATIONS:\n${joinOrEmpty(eligibleObservations.map((observation) => observationToMemoryAgentLine(observation, coverageTierForObservation(observation, coverageById))))}\n\nEligible observations: ${eligibleObservations.length.toLocaleString()} of ${observations.length.toLocaleString()} active (~${observationTokens.toLocaleString()} tokens). Protected recent/unreviewed observations are omitted.\nMaximum drops allowed this run: ${maxDropsAllowed.toLocaleString()} observation${maxDropsAllowed === 1 ? "" : "s"}. This maximum is a hard safety cap, not a target. Drop fewer or none if fewer observations are clearly safe.`;
	await runMemoryAgentLoop({
		model,
		apiKey,
		headers,
		signal,
		agentLoop: args.agentLoop,
		maxTurns: args.maxTurns,
		thinkingLevel: args.thinkingLevel,
		systemPrompt: DROPPER_SYSTEM,
		userText,
		tools: [dropObservations as AgentTool<any>],
	});
	const droppedIds = selectDropCandidates(proposedDropIds, observations, maxDropsAllowed, reflections, protectedObservationIds);
	const reason = droppedIds.length > 0
		? "selected_nonempty"
		: toolCallCount === 0
			? "no_tool_call"
			: proposedDropIds.length === 0
				? "all_filtered"
				: "selected_empty";
	const selectedDropTokens = droppedIds.reduce((sum, id) => sum + (allowed.get(id)?.tokenCount ?? 0), 0);
	debugLog("dropper.result", {
		reason,
		toolCallCount,
		rawRequestedIdsCount,
		missingIdsCount,
		duplicateInRequestCount,
		duplicateInRunCount,
		acceptedCandidateCount: proposedDropIds.length,
		selectedDropsCount: droppedIds.length,
		selectedDropTokens,
		selectedCoverageSummary: summarizeCoverageForIds(droppedIds, observations, coverageById),
		maxDropsAllowed,
	});
	return droppedIds.length > 0 ? droppedIds : undefined;
}
