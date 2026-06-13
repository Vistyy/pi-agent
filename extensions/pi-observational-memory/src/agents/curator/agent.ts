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
	onPhase?: (metrics: CuratorPhaseMetrics) => void;
	clumpedRender?: "flat" | "clumped" | "clumped-full";
}

const MarkNoActionsSchema = Type.Object({});
const CuratorIdsWithReasonSchema = Type.Object({
	ids: Type.Array(Type.String({ minLength: 1 }), { minItems: 1 }),
	reason: Type.String({ minLength: 1 }),
});

type CuratorBatch = { observationIds: string[]; reason: string };
type CuratorPhaseName = "unpin" | "unlinked-preserve" | "preserve";
type CuratorPhaseMetrics = { phase: CuratorPhaseName; durationMs: number; usage: MemoryAgentUsage[] };

type MarkNoActionsArgs = Static<typeof MarkNoActionsSchema>;
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

function renderObservationList(observations: readonly Observation[], pinnedIds: ReadonlySet<string>, flaggedIds: ReadonlySet<string>, coverageById: ReadonlyMap<string, ReflectionCoverageTier>): string {
	return joinOrEmpty(observations.map((observation) => actionSummaryLine(observation, pinnedIds, flaggedIds, coverageById)));
}

function buildFlatUserText(args: {
	reflections: readonly Reflection[];
	candidateObservations: readonly Observation[];
	contextObservations: readonly Observation[];
	pinnedIds: ReadonlySet<string>;
	flaggedIds: ReadonlySet<string>;
	coverageById: ReadonlyMap<string, ReflectionCoverageTier>;
	observationTokens: number;
	maxDropsAllowed: number;
}): string {
	const contextSection = args.contextObservations.length
		? `\n\nREAD-ONLY CONTEXT OBSERVATIONS:\n${renderObservationList(args.contextObservations, args.pinnedIds, args.flaggedIds, args.coverageById)}`
		: "";
	return `CURRENT REFLECTIONS:\n${joinOrEmpty(args.reflections.map(reflectionToSummaryLine))}\n\nACTION CANDIDATES — you may act only on these observation ids:\n${renderObservationList(args.candidateObservations, args.pinnedIds, args.flaggedIds, args.coverageById)}${contextSection}\n\n${curatorRunSummary(args.candidateObservations.length, args.contextObservations.length, args.candidateObservations.length + args.contextObservations.length, args.observationTokens, args.maxDropsAllowed)}`;
}

function buildPinReviewSection(candidateObservations: readonly Observation[], pinnedIds: ReadonlySet<string>, flaggedIds: ReadonlySet<string>, coverageById: ReadonlyMap<string, ReflectionCoverageTier>): string {
	const pinnedCandidates = candidateObservations.filter((observation) => pinnedIds.has(observation.id));
	if (pinnedCandidates.length === 0) return "";
	return `\n\nPIN REVIEW CANDIDATES — currently pinned action candidates. Decide whether each still needs forced visibility, should be unpinned because same-scope evidence makes it stale, or is unsafe to unpin.\n${renderObservationList(pinnedCandidates, pinnedIds, flaggedIds, coverageById)}`;
}

function buildClumpedUserText(args: {
	reflections: readonly Reflection[];
	candidateObservations: readonly Observation[];
	contextObservations: readonly Observation[];
	pinnedIds: ReadonlySet<string>;
	flaggedIds: ReadonlySet<string>;
	coverageById: ReadonlyMap<string, ReflectionCoverageTier>;
	observationTokens: number;
	maxDropsAllowed: number;
	includeUnlinkedContext: boolean;
}): string {
	const reflectionSupportIds = new Set(args.reflections.flatMap((reflection) => reflection.supportingObservationIds));
	const clumps = args.reflections.map((reflection) => {
		const supportIds = new Set(reflection.supportingObservationIds);
		const linkedCandidates = args.candidateObservations.filter((observation) => supportIds.has(observation.id));
		const linkedContext = args.contextObservations.filter((observation) => supportIds.has(observation.id));
		const linkedCandidateSection = linkedCandidates.length
			? `\nLinked action candidates:\n${renderObservationList(linkedCandidates, args.pinnedIds, args.flaggedIds, args.coverageById)}`
			: "\nLinked action candidates: (none)";
		const linkedContextSection = linkedContext.length
			? `\nLinked read-only context observations:\n${renderObservationList(linkedContext, args.pinnedIds, args.flaggedIds, args.coverageById)}`
			: "";
		return `${reflectionToSummaryLine(reflection)}${linkedCandidateSection}${linkedContextSection}`;
	});
	const pinReviewSection = buildPinReviewSection(args.candidateObservations, args.pinnedIds, args.flaggedIds, args.coverageById);
	const unlinkedCandidates = args.candidateObservations.filter((observation) => !reflectionSupportIds.has(observation.id));
	const unlinkedContext = args.contextObservations.filter((observation) => !reflectionSupportIds.has(observation.id));
	const unlinkedContextSection = args.includeUnlinkedContext && unlinkedContext.length
		? `\n\nUNLINKED READ-ONLY CONTEXT OBSERVATIONS — informational only; you may not act on these ids:\n${renderObservationList(unlinkedContext, args.pinnedIds, args.flaggedIds, args.coverageById)}`
		: "";
	return `REFLECTION CLUMPS — audit linked observations against the exact reflection that cites them. A linked observation can still need pinning or follow-up if the reflection omits exact paths, commands, settings, current/stale relationships, blockers, or corrections.${pinReviewSection}\n\n${joinOrEmpty(clumps)}\n\nUNLINKED ACTION CANDIDATES — reviewed observations not cited by any current reflection; you may act only on these and the linked action candidate ids above:\n${renderObservationList(unlinkedCandidates, args.pinnedIds, args.flaggedIds, args.coverageById)}${unlinkedContextSection}\n\n${curatorRunSummary(args.candidateObservations.length, args.contextObservations.length, args.candidateObservations.length + args.contextObservations.length, args.observationTokens, args.maxDropsAllowed)}`;
}

function curatorRunSummary(candidateCount: number, contextCount: number, promptObservationCount: number, observationTokens: number, maxDropsAllowed: number): string {
	return `Action candidates: ${candidateCount.toLocaleString()}. Context observations: ${contextCount.toLocaleString()}. Prompt observations: ${promptObservationCount.toLocaleString()} (~${observationTokens.toLocaleString()} tokens). Maximum drops allowed this run: ${maxDropsAllowed.toLocaleString()}. Protected observations cannot be dropped. Make one conservative curation pass. Each tool call should contain the complete batch for that action type. Call mark_no_actions only when no action is safe or needed.`;
}

type CuratorPassMode = "unpin" | "unlinked-preserve" | "preserve";

async function runCuratorPass(args: RunCuratorArgs, mode: CuratorPassMode, initialResult?: CuratorActionResult): Promise<CuratorActionResult | undefined> {
	const { model, apiKey, headers, reflections, observations, maxDropsAllowed, signal } = args;
	const protectedObservationIds = args.protectedObservationIds ?? [];
	const baseCandidateIds = new Set(args.candidateObservationIds ?? observations.map((observation) => observation.id));
	const linkedIds = new Set(reflections.flatMap((reflection) => reflection.supportingObservationIds));
	const priorActionIds = initialResult ? new Set([...batchIds(initialResult.pinned), ...batchIds(initialResult.flagged), ...batchIds(initialResult.unpinned), ...initialResult.dropped]) : new Set<string>();
	const pinnedInputIds = new Set(args.pinnedObservationIds ?? []);
	const candidateIds = mode === "unpin"
		? new Set([...baseCandidateIds].filter((id) => pinnedInputIds.has(id) && !priorActionIds.has(id)))
		: mode === "unlinked-preserve"
			? new Set([...baseCandidateIds].filter((id) => !linkedIds.has(id) && !priorActionIds.has(id)))
			: new Set([...baseCandidateIds].filter((id) => !priorActionIds.has(id)));
	const candidateObservations = observations.filter((observation) => candidateIds.has(observation.id));
	if (candidateObservations.length === 0) return initialResult;
	const contextObservations = [...observations.filter((observation) => baseCandidateIds.has(observation.id) && !candidateIds.has(observation.id)), ...(args.contextObservations ?? [])].filter((observation) => !candidateIds.has(observation.id));
	const promptObservations = [...candidateObservations, ...contextObservations];

	const pinnedIds = new Set(args.pinnedObservationIds ?? []);
	const flaggedIds = new Set(args.flaggedObservationIds ?? []);
	const protectedIds = new Set(protectedObservationIds);
	const allowedIds = new Set(candidateObservations.map((observation) => observation.id));
	const pinnedAllowedIds = new Set(candidateObservations.filter((observation) => pinnedIds.has(observation.id)).map((observation) => observation.id));
	const droppableIds = new Set(candidateObservations.filter((observation) => !protectedIds.has(observation.id)).map((observation) => observation.id));
	const coverageById = reflectionCoverageMap(promptObservations, reflections);
	const observationTokens = observationTokenSum(promptObservations);

	const result: CuratorActionResult = initialResult ?? { pinned: [], unpinned: [], flagged: [], dropped: [] };
	let toolCallCount = 0;

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
			const blocked = new Set([...result.dropped, ...batchIds(result.unpinned), ...batchIds(result.pinned)]);
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
			const alreadyFlagged = batchIds(result.flagged);
			const data = buildObservationsFlaggedData(ids.filter((id) => !result.dropped.includes(id) && !alreadyFlagged.has(id)), reason);
			if (data) result.flagged.push(data);
		},
	);
	const dropObservations = makeActionTool(
		"drop_observations",
		"Drop observations",
		"Drop every low-value reviewed observation that is clearly safe to tombstone. Include every observation to drop in this complete batch for the drop action type. You may call other action tools afterward if needed, but dropped ids cannot also be pinned, unpinned, or flagged.",
		droppableIds,
		(ids, _reason) => {
			const sameRunProtected = new Set([...batchIds(result.pinned), ...batchIds(result.flagged), ...batchIds(result.unpinned)]);
			result.dropped = selectDropCandidates([...result.dropped, ...ids.filter((id) => !sameRunProtected.has(id))], candidateObservations, maxDropsAllowed, reflections, protectedObservationIds);
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

	const baseUserText = args.clumpedRender === "clumped" || args.clumpedRender === "clumped-full"
		? buildClumpedUserText({
			reflections,
			candidateObservations,
			contextObservations,
			pinnedIds,
			flaggedIds,
			coverageById,
			observationTokens,
			maxDropsAllowed,
			includeUnlinkedContext: args.clumpedRender === "clumped-full",
		})
		: buildFlatUserText({
			reflections,
			candidateObservations,
			contextObservations,
			pinnedIds,
			flaggedIds,
			coverageById,
			observationTokens,
			maxDropsAllowed,
		});
	const phaseInstruction = mode === "unpin"
		? "\n\nACTION PHASE: stale-pin review only. Only call unpin_observations for currently pinned candidates that are clearly stale, or mark_no_actions if none are safe to unpin. Do not pin, flag, or drop in this phase."
		: mode === "unlinked-preserve"
			? "\n\nACTION PHASE: unlinked preservation only. The action candidates in this phase are not cited by any current reflection. Call pin_observations or flag_observations for unlinked durable evidence that needs visibility or reflection follow-up, or mark_no_actions if none need preservation. Do not drop or unpin in this phase."
			: "\n\nACTION PHASE: preservation and cleanup. Prior unpin and unlinked-preservation decisions have already been made; now call pin_observations, flag_observations, drop_observations, or mark_no_actions.";
	const userText = `${baseUserText}${phaseInstruction}`;

	const tools = mode === "unpin"
		? [unpinObservations, markNoActions]
		: mode === "unlinked-preserve"
			? [pinObservations, flagObservations, markNoActions]
			: [pinObservations, flagObservations, dropObservations, markNoActions] as AgentTool<any>[];

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
		pinnedBatchCount: result.pinned.length,
		unpinnedBatchCount: result.unpinned.length,
		flaggedBatchCount: result.flagged.length,
		droppedCount: result.dropped.length,
	});

	return result.pinned.length || result.unpinned.length || result.flagged.length || result.dropped.length ? result : undefined;
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

function emptyCuratorResult(): CuratorActionResult {
	return { pinned: [], unpinned: [], flagged: [], dropped: [] };
}

function mergeCuratorResults(results: CuratorActionResult[]): CuratorActionResult {
	const pinned = results.flatMap((result) => result.pinned);
	const unpinned = results.flatMap((result) => result.unpinned);
	const flagged = results.flatMap((result) => result.flagged);
	const dropped = results.flatMap((result) => result.dropped);
	const unpinnedIds = batchIds(unpinned);
	return {
		pinned: removeIdsFromBatches(pinned, unpinnedIds),
		unpinned,
		flagged: removeIdsFromBatches(flagged, unpinnedIds),
		dropped,
	};
}

async function runCuratorActionPhase(args: RunCuratorArgs, phase: CuratorPhaseName, run: (phaseArgs: RunCuratorArgs) => Promise<CuratorActionResult | undefined>): Promise<CuratorActionResult> {
	return await runCuratorPhase(args, phase, run) ?? emptyCuratorResult();
}

export async function runCurator(args: RunCuratorArgs): Promise<CuratorActionResult | undefined> {
	const [afterUnpin, afterUnlinkedPreserve] = await Promise.all([
		runCuratorActionPhase(args, "unpin", (phaseArgs) => runCuratorPass(phaseArgs, "unpin")),
		runCuratorActionPhase(args, "unlinked-preserve", (phaseArgs) => runCuratorPass(phaseArgs, "unlinked-preserve")),
	]);
	const merged = mergeCuratorResults([afterUnpin, afterUnlinkedPreserve]);
	return runCuratorPhase(args, "preserve", (phaseArgs) => runCuratorPass(phaseArgs, "preserve", merged));
}
