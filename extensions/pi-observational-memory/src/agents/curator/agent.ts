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

type MarkNoActionsArgs = Static<typeof MarkNoActionsSchema>;
type CuratorIdsWithReasonArgs = Static<typeof CuratorIdsWithReasonSchema>;

function normalizeObservationIds(ids: readonly string[] | undefined, allowedIds: ReadonlySet<string>): string[] {
	if (!ids || ids.length === 0) return [];
	const result: string[] = [];
	const seen = new Set<string>();
	for (const id of ids) {
		if (!allowedIds.has(id)) continue;
		if (seen.has(id)) continue;
		seen.add(id);
		result.push(id);
	}
	return result;
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
	if (observations.length === 0) return undefined;

	const pinnedIds = new Set(args.pinnedObservationIds ?? []);
	const flaggedIds = new Set(args.flaggedObservationIds ?? []);
	const protectedIds = new Set(protectedObservationIds);
	const allowedIds = new Set(observations.map((observation) => observation.id));
	const pinnedAllowedIds = new Set(observations.filter((observation) => pinnedIds.has(observation.id)).map((observation) => observation.id));
	const droppableIds = new Set(observations.filter((observation) => !protectedIds.has(observation.id)).map((observation) => observation.id));
	const coverageById = reflectionCoverageMap(observations, reflections);
	const observationTokens = observationTokenSum(observations);

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
				const ids = normalizeObservationIds(params.ids, allowed);
				const rejected = params.ids.length - ids.length;
				if (ids.length > 0) accept(ids, params.reason);
				debugLog("curator.tool_call", { name, requested: params.ids.length, accepted: ids.length, rejected });
				return {
					content: [{ type: "text", text: `${label}: accepted ${ids.length}, rejected ${rejected}.` }],
					details: { accepted: ids.length, rejected },
					terminate: true,
				};
			},
		};
	}

	const markNoActions: AgentTool<typeof MarkNoActionsSchema> = {
		name: "mark_no_actions",
		label: "Mark no actions",
		description: "Mark that no curator action is safe or needed. This tool call terminates the run.",
		parameters: MarkNoActionsSchema,
		execute: async (_id, _params: MarkNoActionsArgs) => {
			noActionCallCount++;
			return { content: [{ type: "text", text: "Marked no curator actions." }], details: { reviewed: true }, terminate: true };
		},
	};

	const pinObservations = makeActionTool(
		"pin_observations",
		"Pin observations",
		"Pin reviewed observations whose exact raw details must remain visible in next context. This tool call terminates the run.",
		allowedIds,
		(ids, reason) => {
			const data = buildObservationsPinnedData(ids, reason);
			if (data) result.pinned.push(data);
		},
	);
	const unpinObservations = makeActionTool(
		"unpin_observations",
		"Unpin observations",
		"Unpin currently pinned observations whose exact raw details no longer need forced visibility. This tool call terminates the run.",
		pinnedAllowedIds,
		(ids, reason) => {
			const data = buildObservationsUnpinnedData(ids, reason);
			if (data) result.unpinned.push(data);
		},
	);
	const flagObservations = makeActionTool(
		"flag_observations",
		"Flag observations",
		"Flag reviewed observations for reflector follow-up when reflection coverage is missing, stale, or contradictory. This tool call terminates the run.",
		allowedIds,
		(ids, reason) => {
			const data = buildObservationsFlaggedData(ids, reason);
			if (data) result.flagged.push(data);
		},
	);
	const dropObservations = makeActionTool(
		"drop_observations",
		"Drop observations",
		"Drop low-value reviewed observations that are clearly safe to tombstone. This tool call terminates the run.",
		droppableIds,
		(ids, _reason) => {
			result.dropped = selectDropCandidates(ids, observations, maxDropsAllowed, reflections, protectedObservationIds);
		},
	);

	debugLog("curator.agent_start", {
		observationCount: observations.length,
		reflectionCount: reflections.length,
		pinnedObservationCount: pinnedIds.size,
		flaggedObservationCount: flaggedIds.size,
		protectedObservationCount: protectedIds.size,
		observationTokens,
		maxDropsAllowed,
		coverageSummary: summarizeCoverage(observations, coverageById),
	});

	const userText = `CURRENT REFLECTIONS:\n${joinOrEmpty(reflections.map(reflectionToSummaryLine))}\n\nREVIEWED OBSERVATIONS:\n${joinOrEmpty(observations.map((observation) => actionSummaryLine(observation, pinnedIds, flaggedIds, coverageById)))}\n\nReviewed observations: ${observations.length.toLocaleString()} (~${observationTokens.toLocaleString()} tokens). Maximum drops allowed this run: ${maxDropsAllowed.toLocaleString()}. Protected observations cannot be dropped. Choose exactly one conservative action batch, or mark_no_actions.`;

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
