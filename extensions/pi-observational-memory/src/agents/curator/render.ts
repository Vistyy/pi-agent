import {
	joinOrEmpty,
} from "../common.js";
import {
	observationTokenSum,
	reflectionToSummaryLine,
	type Observation,
	type Reflection,
} from "../../session-ledger/index.js";
import {
	coverageTierForObservation,
	observationToMemoryAgentLine,
	reflectionCoverageMap,
	type ReflectionCoverageTier,
} from "../coverage.js";

export type CuratorPromptInput = {
	reflections: readonly Reflection[];
	candidateObservations: readonly Observation[];
	contextObservations: readonly Observation[];
	pinnedIds: ReadonlySet<string>;
	flaggedIds: ReadonlySet<string>;
	maxDropsAllowed: number;
};

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

function curatorRunSummary(candidateCount: number, contextCount: number, promptObservationCount: number, observationTokens: number, maxDropsAllowed: number): string {
	return `Action candidates: ${candidateCount.toLocaleString()}. Context observations: ${contextCount.toLocaleString()}. Prompt observations: ${promptObservationCount.toLocaleString()} (~${observationTokens.toLocaleString()} tokens). Maximum drops allowed this run: ${maxDropsAllowed.toLocaleString()}. Protected observations cannot be dropped. Make one conservative curation pass. Each tool call should contain the complete batch for that action type. Call mark_no_actions only when no action is safe or needed.`;
}

function buildPinReviewSection(candidateObservations: readonly Observation[], pinnedIds: ReadonlySet<string>, flaggedIds: ReadonlySet<string>, coverageById: ReadonlyMap<string, ReflectionCoverageTier>): string {
	const pinnedCandidates = candidateObservations.filter((observation) => pinnedIds.has(observation.id));
	if (pinnedCandidates.length === 0) return "";
	return `\n\nPIN REVIEW CANDIDATES — currently pinned action candidates. Decide whether each still needs forced visibility, should be unpinned because same-scope evidence makes it stale, or is unsafe to unpin.\n${renderObservationList(pinnedCandidates, pinnedIds, flaggedIds, coverageById)}`;
}

function renderCuratorPrompt(args: CuratorPromptInput, coverageById: ReadonlyMap<string, ReflectionCoverageTier>, observationTokens: number): string {
	const reflectionSupportIds = new Set(args.reflections.flatMap((reflection) => reflection.supportingObservationIds));
	const clumps = args.reflections.map((reflection) => {
		const supportIds = new Set(reflection.supportingObservationIds);
		const linkedCandidates = args.candidateObservations.filter((observation) => supportIds.has(observation.id));
		const linkedContext = args.contextObservations.filter((observation) => supportIds.has(observation.id));
		const linkedCandidateSection = linkedCandidates.length
			? `\nLinked action candidates:\n${renderObservationList(linkedCandidates, args.pinnedIds, args.flaggedIds, coverageById)}`
			: "\nLinked action candidates: (none)";
		const linkedContextSection = linkedContext.length
			? `\nLinked read-only context observations:\n${renderObservationList(linkedContext, args.pinnedIds, args.flaggedIds, coverageById)}`
			: "";
		return `${reflectionToSummaryLine(reflection)}${linkedCandidateSection}${linkedContextSection}`;
	});
	const pinReviewSection = buildPinReviewSection(args.candidateObservations, args.pinnedIds, args.flaggedIds, coverageById);
	const unlinkedCandidates = args.candidateObservations.filter((observation) => !reflectionSupportIds.has(observation.id));
	return `REFLECTION CLUMPS — audit linked observations against the exact reflection that cites them. A linked observation can still need pinning or follow-up if the reflection omits exact paths, commands, settings, current/stale relationships, blockers, or corrections.${pinReviewSection}\n\n${joinOrEmpty(clumps)}\n\nUNLINKED ACTION CANDIDATES — reviewed observations not cited by any current reflection; you may act only on these and the linked action candidate ids above:\n${renderObservationList(unlinkedCandidates, args.pinnedIds, args.flaggedIds, coverageById)}\n\n${curatorRunSummary(args.candidateObservations.length, args.contextObservations.length, args.candidateObservations.length + args.contextObservations.length, observationTokens, args.maxDropsAllowed)}`;
}

export function buildCuratorUserText(args: CuratorPromptInput): { userText: string; observationTokens: number; coverageById: ReadonlyMap<string, ReflectionCoverageTier> } {
	const promptObservations = [...args.candidateObservations, ...args.contextObservations];
	const coverageById = reflectionCoverageMap(promptObservations, args.reflections);
	const observationTokens = observationTokenSum(promptObservations);
	return {
		userText: renderCuratorPrompt(args, coverageById, observationTokens),
		observationTokens,
		coverageById,
	};
}
