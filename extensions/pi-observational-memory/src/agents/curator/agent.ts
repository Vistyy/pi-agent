import { agentLoop, type AgentTool } from "@earendil-works/pi-agent-core";
import type { Model, ModelThinkingLevel } from "@earendil-works/pi-ai";
import { Type } from "@earendil-works/pi-ai";
import type { Static } from "typebox";
import { debugLog } from "../../debug-log.js";
import type { Observation, Reflection } from "../../session-ledger/index.js";
import { runMemoryAgentLoop, type MemoryAgentUsage } from "../common.js";
import { reflectionCoverageMap, summarizeCoverage } from "../coverage.js";
import {
	appendFlagged,
	appendPinned,
	appendUnpinned,
	batchIds,
	emptyCuratorResult,
	hasCuratorActions,
	mergeCuratorResults,
	removeIdsFromBatches,
} from "./actions.js";
import { selectDropCandidates } from "./drop.js";
import { CURATOR_SYSTEM } from "./prompts.js";
import { buildCuratorUserText } from "./render.js";
import { selectCuratorPhaseInput, type CuratorPassMode } from "./selection.js";

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
	onPhase?: (metrics: CuratorPhaseMetrics) => void;
}

const MarkNoActionsSchema = Type.Object({});
const CuratorIdsWithReasonSchema = Type.Object({
	ids: Type.Array(Type.String({ minLength: 1 }), { minItems: 1 }),
	reason: Type.String({ minLength: 1 }),
});

type CuratorPhaseName = "unpin" | "unlinked-preserve" | "preserve";
type CuratorPhaseMetrics = { phase: CuratorPhaseName; durationMs: number; usage: MemoryAgentUsage[] };
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

function phaseInstruction(mode: CuratorPassMode): string {
	return mode === "unpin"
		? "\n\nACTION PHASE: stale-pin review only. Only call unpin_observations for currently pinned candidates that are clearly stale, or mark_no_actions if none are safe to unpin. Do not pin, flag, or drop in this phase."
		: mode === "unlinked-preserve"
			? "\n\nACTION PHASE: unlinked preservation only. The action candidates in this phase are not cited by any current reflection. Call pin_observations or flag_observations for unlinked durable evidence that needs visibility or reflection follow-up, or mark_no_actions if none need preservation. Do not drop or unpin in this phase."
			: "\n\nACTION PHASE: preservation and cleanup. Prior unpin and unlinked-preservation decisions have already been made; now call pin_observations, flag_observations, drop_observations, or mark_no_actions.";
}

function makeActionTool(
	name: string,
	label: string,
	description: string,
	allowed: ReadonlySet<string>,
	accept: (ids: string[], reason: string) => void,
	onCall: (requested: number, accepted: number, rejected: number) => void,
): AgentTool<typeof CuratorIdsWithReasonSchema> {
	return {
		name,
		label,
		description,
		parameters: CuratorIdsWithReasonSchema,
		execute: async (_id, params: CuratorIdsWithReasonArgs) => {
			const { accepted: ids, rejected } = partitionObservationIds(params.ids, allowed);
			if (ids.length > 0) accept(ids, params.reason);
			onCall(params.ids.length, ids.length, rejected.length);
			debugLog("curator.tool_call", { name, requested: params.ids.length, accepted: ids.length, rejected: rejected.length, rejectedIds: rejected.map((item) => item.id) });
			return {
				content: [{ type: "text", text: `${label}: accepted ${ids.length}, rejected ${rejected.length}${rejected.length ? ` (${rejected.map((item) => `${item.id}: ${item.reason}`).join(", ")})` : ""}. You may continue with other action tools if another action type is needed.` }],
				details: { accepted: ids, rejected },
				terminate: false,
			};
		},
	};
}

function curatorTools(args: {
	mode: CuratorPassMode;
	result: CuratorActionResult;
	allowedIds: ReadonlySet<string>;
	pinnedAllowedIds: ReadonlySet<string>;
	droppableIds: ReadonlySet<string>;
	candidateObservations: Observation[];
	maxDropsAllowed: number;
	reflections: Reflection[];
	protectedObservationIds: readonly string[];
	onToolCall: (requested: number, accepted: number, rejected: number) => void;
}): AgentTool<any>[] {
	const markNoActions: AgentTool<typeof MarkNoActionsSchema> = {
		name: "mark_no_actions",
		label: "Mark no actions",
		description: "Mark that no curator action is safe or needed. Use only if you have not taken any other curator action. This tool call terminates the run.",
		parameters: MarkNoActionsSchema,
		execute: async (_id, _params: MarkNoActionsArgs) => ({
			content: [{ type: "text", text: hasCuratorActions(args.result) ? "Ignored no-action marker because curator actions already exist." : "Marked no curator actions." }],
			details: { reviewed: !hasCuratorActions(args.result), ignored: hasCuratorActions(args.result) },
			terminate: true,
		}),
	};

	const pinObservations = makeActionTool(
		"pin_observations",
		"Pin observations",
		"Pin every reviewed observation whose exact raw details must remain visible in next context. Include every observation to pin in this complete batch for the pin action type. You may call other action tools afterward if needed.",
		args.allowedIds,
		(ids, reason) => appendPinned(args.result, ids, reason),
		args.onToolCall,
	);
	const unpinObservations = makeActionTool(
		"unpin_observations",
		"Unpin observations",
		"Unpin every currently pinned observation whose exact raw details no longer need forced visibility. Include every observation to unpin in this complete batch for the unpin action type. You may call other action tools afterward if needed.",
		args.pinnedAllowedIds,
		(ids, reason) => appendUnpinned(args.result, ids, reason),
		args.onToolCall,
	);
	const flagObservations = makeActionTool(
		"flag_observations",
		"Flag observations",
		"Flag every reviewed observation needing reflector follow-up when reflection coverage is missing, stale, contradictory, or missing exact paths/commands/settings/stale-current relations. Include every observation to flag in this complete batch for the flag action type. You may call other action tools afterward if needed.",
		args.allowedIds,
		(ids, reason) => appendFlagged(args.result, ids, reason),
		args.onToolCall,
	);
	const dropObservations = makeActionTool(
		"drop_observations",
		"Drop observations",
		"Drop every low-value reviewed observation that is clearly safe to tombstone. Include every observation to drop in this complete batch for the drop action type. You may call other action tools afterward if needed, but dropped ids cannot also be pinned, unpinned, or flagged.",
		args.droppableIds,
		(ids) => {
			const sameRunProtected = new Set([...batchIds(args.result.pinned), ...batchIds(args.result.flagged), ...batchIds(args.result.unpinned)]);
			args.result.dropped = selectDropCandidates([...args.result.dropped, ...ids.filter((id) => !sameRunProtected.has(id))], args.candidateObservations, args.maxDropsAllowed, args.reflections, args.protectedObservationIds);
			const dropped = new Set(args.result.dropped);
			args.result.pinned = removeIdsFromBatches(args.result.pinned, dropped);
			args.result.unpinned = removeIdsFromBatches(args.result.unpinned, dropped);
			args.result.flagged = removeIdsFromBatches(args.result.flagged, dropped);
		},
		args.onToolCall,
	);

	return args.mode === "unpin"
		? [unpinObservations, markNoActions]
		: args.mode === "unlinked-preserve"
			? [pinObservations, flagObservations, markNoActions]
			: [pinObservations, flagObservations, dropObservations, markNoActions];
}

async function runCuratorPass(args: RunCuratorArgs, mode: CuratorPassMode, initialResult?: CuratorActionResult): Promise<CuratorActionResult> {
	const protectedObservationIds = args.protectedObservationIds ?? [];
	const phaseInput = selectCuratorPhaseInput({ ...args, mode, protectedObservationIds, initialResult });
	const result = initialResult ?? emptyCuratorResult();
	if (phaseInput.candidateObservations.length === 0) return result;

	const pinnedIds = new Set(args.pinnedObservationIds ?? []);
	const flaggedIds = new Set(args.flaggedObservationIds ?? []);
	const protectedIds = new Set(protectedObservationIds);
	const rendered = buildCuratorUserText({
		reflections: args.reflections,
		candidateObservations: phaseInput.candidateObservations,
		contextObservations: phaseInput.contextObservations,
		pinnedIds,
		flaggedIds,
		maxDropsAllowed: args.maxDropsAllowed,
	});
	let toolCallCount = 0;
	const tools = curatorTools({
		mode,
		result,
		allowedIds: phaseInput.allowedIds,
		pinnedAllowedIds: phaseInput.pinnedAllowedIds,
		droppableIds: phaseInput.droppableIds,
		candidateObservations: phaseInput.candidateObservations,
		maxDropsAllowed: args.maxDropsAllowed,
		reflections: args.reflections,
		protectedObservationIds,
		onToolCall: () => toolCallCount++,
	});

	debugLog("curator.agent_start", {
		candidateObservationCount: phaseInput.candidateObservations.length,
		contextObservationCount: phaseInput.contextObservations.length,
		reflectionCount: args.reflections.length,
		pinnedObservationCount: pinnedIds.size,
		flaggedObservationCount: flaggedIds.size,
		protectedObservationCount: protectedIds.size,
		observationTokens: rendered.observationTokens,
		maxDropsAllowed: args.maxDropsAllowed,
		coverageSummary: summarizeCoverage(phaseInput.promptObservations, reflectionCoverageMap(phaseInput.promptObservations, args.reflections)),
	});

	await runMemoryAgentLoop({
		model: args.model,
		apiKey: args.apiKey,
		headers: args.headers,
		signal: args.signal,
		agentLoop: args.agentLoop,
		maxTurns: args.maxTurns,
		thinkingLevel: args.thinkingLevel,
		systemPrompt: CURATOR_SYSTEM,
		userText: `${rendered.userText}${phaseInstruction(mode)}`,
		tools,
		agentName: "curator",
		onUsage: args.onUsage,
	});

	debugLog("curator.result", {
		toolCallCount,
		pinnedBatchCount: result.pinned.length,
		unpinnedBatchCount: result.unpinned.length,
		flaggedBatchCount: result.flagged.length,
		droppedCount: result.dropped.length,
	});

	return result;
}

async function runCuratorPhase<T>(args: RunCuratorArgs, phase: CuratorPhaseName, run: (phaseArgs: RunCuratorArgs) => Promise<T>): Promise<T> {
	const started = Date.now();
	const usage: MemoryAgentUsage[] = [];
	const result = await run({
		...args,
		onUsage: (item) => {
			usage.push(item);
			args.onUsage?.(item);
		},
	});
	args.onPhase?.({ phase, durationMs: Date.now() - started, usage });
	return result;
}

export async function runCurator(args: RunCuratorArgs): Promise<CuratorActionResult | undefined> {
	const [afterUnpin, afterUnlinkedPreserve] = await Promise.all([
		runCuratorPhase(args, "unpin", (phaseArgs) => runCuratorPass(phaseArgs, "unpin")),
		runCuratorPhase(args, "unlinked-preserve", (phaseArgs) => runCuratorPass(phaseArgs, "unlinked-preserve")),
	]);
	const merged = mergeCuratorResults([afterUnpin, afterUnlinkedPreserve]);
	const result = await runCuratorPhase(args, "preserve", (phaseArgs) => runCuratorPass(phaseArgs, "preserve", merged));
	return hasCuratorActions(result) ? result : undefined;
}
