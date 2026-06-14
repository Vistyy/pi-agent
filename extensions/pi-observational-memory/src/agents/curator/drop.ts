import {
	REFLECTION_COVERAGE_DROP_RANK,
	coverageTierForObservation,
	reflectionCoverageMap,
} from "../coverage.js";
import type { Observation, Reflection } from "../../session-ledger/index.js";

function timestampRank(timestamp: string): number {
	const parsed = Date.parse(timestamp);
	return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
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
