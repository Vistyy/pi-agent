import type { Observation, Reflection } from "../../session-ledger/index.js";
import { batchIds } from "./actions.js";
import type { CuratorActionResult } from "./agent.js";

export type CuratorPassMode = "unpin" | "unlinked-preserve" | "preserve";

export type CuratorPhaseInput = {
	candidateObservations: Observation[];
	contextObservations: Observation[];
	promptObservations: Observation[];
	allowedIds: Set<string>;
	pinnedAllowedIds: Set<string>;
	droppableIds: Set<string>;
};

export function selectCuratorPhaseInput(args: {
	mode: CuratorPassMode;
	observations: Observation[];
	reflections: Reflection[];
	candidateObservationIds?: readonly string[];
	contextObservations?: Observation[];
	pinnedObservationIds?: readonly string[];
	protectedObservationIds?: readonly string[];
	initialResult?: CuratorActionResult;
}): CuratorPhaseInput {
	const baseCandidateIds = new Set(args.candidateObservationIds ?? args.observations.map((observation) => observation.id));
	const linkedIds = new Set(args.reflections.flatMap((reflection) => reflection.sources.filter((source) => source.startsWith("obs_"))));
	const priorActionIds = args.initialResult ? new Set([...batchIds(args.initialResult.pinned), ...batchIds(args.initialResult.flagged), ...batchIds(args.initialResult.unpinned), ...args.initialResult.dropped]) : new Set<string>();
	const pinnedInputIds = new Set(args.pinnedObservationIds ?? []);
	const protectedIds = new Set(args.protectedObservationIds ?? []);
	const candidateIds = args.mode === "unpin"
		? new Set([...baseCandidateIds].filter((id) => pinnedInputIds.has(id) && !priorActionIds.has(id)))
		: args.mode === "unlinked-preserve"
			? new Set([...baseCandidateIds].filter((id) => !linkedIds.has(id) && !priorActionIds.has(id)))
			: new Set([...baseCandidateIds].filter((id) => !priorActionIds.has(id)));
	const candidateObservations = args.observations.filter((observation) => candidateIds.has(observation.id));
	const contextObservations = [...args.observations.filter((observation) => baseCandidateIds.has(observation.id) && !candidateIds.has(observation.id)), ...(args.contextObservations ?? [])].filter((observation) => !candidateIds.has(observation.id));
	const promptObservations = [...candidateObservations, ...contextObservations];
	return {
		candidateObservations,
		contextObservations,
		promptObservations,
		allowedIds: new Set(candidateObservations.map((observation) => observation.id)),
		pinnedAllowedIds: new Set(candidateObservations.filter((observation) => pinnedInputIds.has(observation.id)).map((observation) => observation.id)),
		droppableIds: new Set(candidateObservations.filter((observation) => !protectedIds.has(observation.id)).map((observation) => observation.id)),
	};
}
