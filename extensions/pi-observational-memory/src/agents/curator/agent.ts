import { agentLoop, type AgentTool } from "@earendil-works/pi-agent-core";
import type { Model, ModelThinkingLevel } from "@earendil-works/pi-ai";
import { Type } from "@earendil-works/pi-ai";
import type { Static } from "typebox";
import { debugLog } from "../../debug-log.js";
import {
	buildObservationsFlaggedData,
	buildObservationsPinnedData,
	buildObservationsUnpinnedData,
	observationTokenSum,
	reflectionToSummaryLine,
	type Observation,
	type Reflection,
} from "../../session-ledger/index.js";
import { joinOrEmpty, runMemoryAgentLoop, type MemoryAgentUsage } from "../common.js";
import {
	coverageTierForObservation,
	observationToMemoryAgentLine,
	reflectionCoverageMap,
	summarizeCoverage,
	type ReflectionCoverageTier,
} from "../coverage.js";
import { selectDropCandidates } from "../dropper/agent.js";
import { CURATOR_SYSTEM } from "./prompts.js";

export type CuratorActionResult = {
	pinned: Array<{ observationIds: string[]; reason: string }>;
	unpinned: Array<{ observationIds: string[]; reason: string }>;
	flagged: Array<{ observationIds: string[]; reason: string }>;
	dropped: string[];
};

interface RunCuratorArgs {
	model: Model<any>;
	apiKey: string;
	headers?: Record<string, string>;
	reflections: Reflection[];
	observations: Observation[];
	candidateObservationIds?: readonly string[];
	contextObservations?: Observation[];
	pinnedObservationIds?: readonly string[];
	flaggedObservationIds?: readonly string[];
	maxDropsAllowed: number;
	protectedObservationIds?: readonly string[];
	signal?: AbortSignal;
	agentLoop?: typeof agentLoop;
	maxTurns?: number;
	thinkingLevel?: ModelThinkingLevel;
	onUsage?: (usage: MemoryAgentUsage) => void;
}

const MarkNoActionsSchema = Type.Object({});
const CuratorIdsWithReasonSchema = Type.Object({
	ids: Type.Array(Type.String({ minLength: 1 }), { minItems: 1 }),
	reason: Type.String({ minLength: 1 }),
});

type CuratorBatch = { observationIds: string[]; reason: string };

type MarkNoActionsArgs = Static<typeof MarkNoActionsSchema>;
type CuratorIdsWithReasonArgs = Static<typeof CuratorIdsWithReasonSchema>;

function partitionObservationIds(ids: readonly string[] | undefined, allowedIds: ReadonlySet<string>): { accepted: string[]; rejected: Array<{ id: string; reason: string }> } {
	if (!ids || ids.length === 0) return { accepted: [], rejected: [] };
	const accepted: string[] = [];
	const rejected: Array<{ id: string; reason: string }> = [];
	const seen = new Set<string>();
	for (const id of ids) {
		if (seen.has(id)) {
			rejected.push({ id, reason: "duplicate" });
			continue;
		}
		seen.add(id);
		if (!allowedIds.has(id)) {
			rejected.push({ id, reason: "not_action_candidate" });
			continue;
		}
		accepted.push(id);
	}
	return { accepted, rejected };
}

function removeIdsFromBatches(batches: CuratorBatch[], ids: ReadonlySet<string>): CuratorBatch[] {
	return batches
		.map((batch) => ({ ...batch, observationIds: batch.observationIds.filter((id) => !ids.has(id)) }))
		.filter((batch) => batch.observationIds.length > 0);
}

function batchIds(batches: readonly CuratorBatch[]): Set<string> {
	return new Set(batches.flatMap((batch) => batch.observationIds));
}

function actionSummaryLine(observation: Observation, pinnedIds: ReadonlySet<string>, flaggedIds: ReadonlySet<string>, coverageById: ReadonlyMap<string, ReflectionCoverageTier>): string {
	const labels = [
		pinnedIds.has(observation.id) ? "pinned" : undefined,
		flaggedIds.has(observation.id) ? "flagged" : undefined,
	].filter(Boolean).join(", ");
	const suffix = labels ? ` [state: ${labels}]` : "";
	return `${observationToMemoryAgentLine(observation, coverageTierForObservation(observation, coverageById))}${suffix}`;
}

export async function runCurator(args: RunCuratorArgs): Promise<CuratorActionResult | undefined> {
	const { model, apiKey, headers, reflections, observations, maxDropsAllowed, protectedObservationIds = [], signal } = args;
	const candidateIds = new Set(args.candidateObservationIds ?? observations.map((observation) => observation.id));
	const candidateObservations = observations.filter((observation) => candidateIds.has(observation.id));
	if (candidateObservations.length === 0) return undefined;
	const contextObservations = (args.contextObservations ?? []).filter((observation) => !candidateIds.has(observation.id));
	const promptObservations = [...candidateObservations, ...contextObservations];

	const pinnedIds = new Set(args.pinnedObservationIds ?? []);
	const flaggedIds = new Set(args.flaggedObservationIds ?? []);
	const protectedIds = new Set(protectedObservationIds);
	const allowedIds = new Set(candidateObservations.map((observation) => observation.id));
	const pinnedAllowedIds = new Set(candidateObservations.filter((observation) => pinnedIds.has(observation.id)).map((observation) => observation.id));
	const droppableIds = new Set(candidateObservations.filter((observation) => !protectedIds.has(observation.id)).map((observation) => observation.id));
	const coverageById = reflectionCoverageMap(promptObservations, reflections);
	const observationTokens = observationTokenSum(promptObservations);

	const result: CuratorActionResult = { pinned: [], unpinned: [], flagged: [], dropped: [] };
	let toolCallCount = 0;
	let noActionCallCount = 0;

	function makeActionTool(
		name: string,
		label: string,
		description: string,
		allowed: ReadonlySet<string>,
		accept: (ids: string[], reason: string) => void,
	): AgentTool<typeof CuratorIdsWithReasonSchema> {
		return {
			name,
			label,
			description,
			parameters: CuratorIdsWithReasonSchema,
			execute: async (_id, params: CuratorIdsWithReasonArgs) => {
				toolCallCount++;
				const { accepted: ids, rejected } = partitionObservationIds(params.ids, allowed);
				if (ids.length > 0) accept(ids, params.reason);
				debugLog("curator.tool_call", { name, requested: params.ids.length, accepted: ids.length, rejected: rejected.length, rejectedIds: rejected.map((item) => item.id) });
				return {
					content: [{ type: "text", text: `${label}: accepted ${ids.length}, rejected ${rejected.length}${rejected.length ? ` (${rejected.map((item) => `${item.id}: ${item.reason}`).join(", ")})` : ""}. You may continue with other action tools if another action type is needed.` }],
					details: { accepted: ids, rejected },
					terminate: false,
				};
			},
		};
	}

	const markNoActions: AgentTool<typeof MarkNoActionsSchema> = {
		name: "mark_no_actions",
		label: "Mark no actions",
		description: "Mark that no curator action is safe or needed. Use only if you have not taken any other curator action. This tool call terminates the run.",
		parameters: MarkNoActionsSchema,
		execute: async (_id, _params: MarkNoActionsArgs) => {
			noActionCallCount++;
			const hasActions = result.pinned.length > 0 || result.unpinned.length > 0 || result.flagged.length > 0 || result.dropped.length > 0;
			return { content: [{ type: "text", text: hasActions ? "Ignored no-action marker because curator actions already exist." : "Marked no curator actions." }], details: { reviewed: !hasActions, ignored: hasActions }, terminate: true };
		},
	};

	const pinObservations = makeActionTool(
		"pin_observations",
		"Pin observations",
		"Pin every reviewed observation whose exact raw details must remain visible in next context. Include every observation to pin in this complete batch for the pin action type. You may call other action tools afterward if needed.",
		allowedIds,
		(ids, reason) => {
			const blocked = new Set([...result.dropped, ...batchIds(result.unpinned)]);
			const data = buildObservationsPinnedData(ids.filter((id) => !blocked.has(id)), reason);
			if (data) result.pinned.push(data);
		},
	);
	const unpinObservations = makeActionTool(
		"unpin_observations",
		"Unpin observations",
		"Unpin every currently pinned observation whose exact raw details no longer need forced visibility. Include every observation to unpin in this complete batch for the unpin action type. You may call other action tools afterward if needed.",
		pinnedAllowedIds,
		(ids, reason) => {
			const blocked = new Set([...result.dropped, ...batchIds(result.pinned)]);
			const data = buildObservationsUnpinnedData(ids.filter((id) => !blocked.has(id)), reason);
			if (data) result.unpinned.push(data);
		},
	);
	const flagObservations = makeActionTool(
		"flag_observations",
		"Flag observations",
		"Flag every reviewed observation needing reflector follow-up when reflection coverage is missing, stale, contradictory, or missing exact paths/commands/settings/stale-current relations. Include every observation to flag in this complete batch for the flag action type. You may call other action tools afterward if needed.",
		allowedIds,
		(ids, reason) => {
			const data = buildObservationsFlaggedData(ids.filter((id) => !result.dropped.includes(id)), reason);
			if (data) result.flagged.push(data);
		},
	);
	const dropObservations = makeActionTool(
		"drop_observations",
		"Drop observations",
		"Drop every low-value reviewed observation that is clearly safe to tombstone. Include every observation to drop in this complete batch for the drop action type. You may call other action tools afterward if needed, but dropped ids cannot also be pinned, unpinned, or flagged.",
		droppableIds,
		(ids, _reason) => {
			result.dropped = selectDropCandidates([...result.dropped, ...ids], candidateObservations, maxDropsAllowed, reflections, protectedObservationIds);
			const dropped = new Set(result.dropped);
			result.pinned = removeIdsFromBatches(result.pinned, dropped);
			result.unpinned = removeIdsFromBatches(result.unpinned, dropped);
			result.flagged = removeIdsFromBatches(result.flagged, dropped);
		},
	);

	debugLog("curator.agent_start", {
		candidateObservationCount: candidateObservations.length,
		contextObservationCount: contextObservations.length,
		reflectionCount: reflections.length,
		pinnedObservationCount: pinnedIds.size,
		flaggedObservationCount: flaggedIds.size,
		protectedObservationCount: protectedIds.size,
		observationTokens,
		maxDropsAllowed,
		coverageSummary: summarizeCoverage(promptObservations, coverageById),
	});

	const contextSection = contextObservations.length
		? `\n\nREAD-ONLY CONTEXT OBSERVATIONS:\n${joinOrEmpty(contextObservations.map((observation) => actionSummaryLine(observation, pinnedIds, flaggedIds, coverageById)))}`
		: "";
	const userText = `CURRENT REFLECTIONS:\n${joinOrEmpty(reflections.map(reflectionToSummaryLine))}\n\nACTION CANDIDATES — you may pin, unpin, flag, or drop only these observation ids:\n${joinOrEmpty(candidateObservations.map((observation) => actionSummaryLine(observation, pinnedIds, flaggedIds, coverageById)))}${contextSection}\n\nAction candidates: ${candidateObservations.length.toLocaleString()}. Context observations: ${contextObservations.length.toLocaleString()}. Prompt observations: ${promptObservations.length.toLocaleString()} (~${observationTokens.toLocaleString()} tokens). Maximum drops allowed this run: ${maxDropsAllowed.toLocaleString()}. Protected observations cannot be dropped. Make one conservative curation pass. You may call multiple action tools if multiple action types are needed; each tool call should contain the complete batch for that action type. Call mark_no_actions only when no action is safe or needed.`;

	await runMemoryAgentLoop({
		model,
		apiKey,
		headers,
		signal,
		agentLoop: args.agentLoop,
		maxTurns: args.maxTurns,
		thinkingLevel: args.thinkingLevel,
		systemPrompt: CURATOR_SYSTEM,
		userText,
		tools: [pinObservations, unpinObservations, flagObservations, dropObservations, markNoActions] as AgentTool<any>[],
		agentName: "curator",
		onUsage: args.onUsage,
	});

	debugLog("curator.result", {
		toolCallCount,
		noActionCallCount,
		pinnedBatchCount: result.pinned.length,
		unpinnedBatchCount: result.unpinned.length,
		flaggedBatchCount: result.flagged.length,
		droppedCount: result.dropped.length,
	});

	return result.pinned.length || result.unpinned.length || result.flagged.length || result.dropped.length ? result : undefined;
}
