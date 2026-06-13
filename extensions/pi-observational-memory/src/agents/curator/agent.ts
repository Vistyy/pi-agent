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
	REFLECTION_COVERAGE_DROP_RANK,
	coverageTierForObservation,
	observationToMemoryAgentLine,
	reflectionCoverageMap,
	summarizeCoverage,
	type ReflectionCoverageTier,
} from "../coverage.js";
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
const CuratorInventorySchema = Type.Object({
	mustPreserve: Type.Array(Type.String(), { default: [] }),
	needsFollowUp: Type.Array(Type.String(), { default: [] }),
	stalePinCandidates: Type.Array(Type.String(), { default: [] }),
	safeDropCandidates: Type.Array(Type.String(), { default: [] }),
});
const CuratorIdsWithReasonSchema = Type.Object({
	ids: Type.Array(Type.String({ minLength: 1 }), { minItems: 1 }),
	reason: Type.String({ minLength: 1 }),
});

type CuratorBatch = { observationIds: string[]; reason: string };

type MarkNoActionsArgs = Static<typeof MarkNoActionsSchema>;
type CuratorInventoryArgs = Static<typeof CuratorInventorySchema>;
type CuratorIdsWithReasonArgs = Static<typeof CuratorIdsWithReasonSchema>;

function timestampRank(timestamp: string): number {
	const parsed = Date.parse(timestamp);
	return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
}

function selectDropCandidates(
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
		if (!firstProposalIndex.has(ids[i])) firstProposalIndex.set(ids[i], i);
	}

	return Array.from(firstProposalIndex.entries())
		.map(([id, index]) => ({ id, index, observation: byId.get(id) }))
		.filter((candidate): candidate is { id: string; index: number; observation: Observation } =>
			candidate.observation !== undefined && !protectedIds.has(candidate.id)
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
	const labels: string[] = [];
	if (pinnedIds.has(observation.id)) labels.push("pinned");
	if (flaggedIds.has(observation.id)) labels.push("flagged");
	const suffix = labels.length > 0 ? ` [state: ${labels.join(", ")}]` : "";
	return `${observationToMemoryAgentLine(observation, coverageTierForObservation(observation, coverageById))}${suffix}`;
}

async function runCuratorPass(args: RunCuratorArgs): Promise<CuratorActionResult | undefined> {
	const { model, apiKey, headers, reflections, observations, maxDropsAllowed, signal } = args;
	const protectedObservationIds = args.protectedObservationIds ?? [];
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
	let inventoryCallCount = 0;
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

	const recordInventory: AgentTool<typeof CuratorInventorySchema> = {
		name: "record_inventory",
		label: "Record inventory",
		description: "Non-mutating planning tool. Call before action tools to classify candidate observations into mustPreserve, needsFollowUp, stalePinCandidates, and safeDropCandidates. This records your evidence inventory and lets you continue with action tools.",
		parameters: CuratorInventorySchema,
		execute: async (_id, params: CuratorInventoryArgs) => {
			inventoryCallCount++;
			const checked = {
				mustPreserve: partitionObservationIds(params.mustPreserve, allowedIds),
				needsFollowUp: partitionObservationIds(params.needsFollowUp, allowedIds),
				stalePinCandidates: partitionObservationIds(params.stalePinCandidates, allowedIds),
				safeDropCandidates: partitionObservationIds(params.safeDropCandidates, allowedIds),
			};
			const acceptedCount = Object.values(checked).reduce((total, item) => total + item.accepted.length, 0);
			const rejected = Object.values(checked).flatMap((item) => item.rejected);
			debugLog("curator.inventory", { acceptedCount, rejectedCount: rejected.length });
			return {
				content: [{ type: "text", text: `Inventory recorded: ${acceptedCount} accepted ids, ${rejected.length} rejected ids${rejected.length ? ` (${rejected.map((item) => `${item.id}: ${item.reason}`).join(", ")})` : ""}. Continue with action tools if actions are needed.` }],
				details: checked,
				terminate: false,
			};
		},
	};

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
	const userText = `CURRENT REFLECTIONS:\n${joinOrEmpty(reflections.map(reflectionToSummaryLine))}\n\nACTION CANDIDATES — you may act only on these observation ids:\n${joinOrEmpty(candidateObservations.map((observation) => actionSummaryLine(observation, pinnedIds, flaggedIds, coverageById)))}${contextSection}\n\nAction candidates: ${candidateObservations.length.toLocaleString()}. Context observations: ${contextObservations.length.toLocaleString()}. Prompt observations: ${promptObservations.length.toLocaleString()} (~${observationTokens.toLocaleString()} tokens). Maximum drops allowed this run: ${maxDropsAllowed.toLocaleString()}. Protected observations cannot be dropped. Make one conservative curation pass. Each tool call should contain the complete batch for that action type. Call mark_no_actions only when no action is safe or needed.`;

	const tools = [recordInventory, pinObservations, unpinObservations, flagObservations, dropObservations, markNoActions] as AgentTool<any>[];

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
		tools,
		agentName: "curator",
		onUsage: args.onUsage,
	});

	debugLog("curator.result", {
		toolCallCount,
		inventoryCallCount,
		noActionCallCount,
		pinnedBatchCount: result.pinned.length,
		unpinnedBatchCount: result.unpinned.length,
		flaggedBatchCount: result.flagged.length,
		droppedCount: result.dropped.length,
	});

	return result.pinned.length || result.unpinned.length || result.flagged.length || result.dropped.length ? result : undefined;
}

export async function runCurator(args: RunCuratorArgs): Promise<CuratorActionResult | undefined> {
	return runCuratorPass(args);
}
