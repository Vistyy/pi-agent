import { observationTokenEstimate, type Observation, type Reflection } from "../session-ledger/index.js";

export const REFLECTION_COVERAGE_TIERS = ["none", "partial", "strong"] as const;
export type ReflectionCoverageTier = typeof REFLECTION_COVERAGE_TIERS[number];

export type CoverageBucket = Record<ReflectionCoverageTier, { count: number; tokens: number }>;
export type CoverageTransitionSummary = Record<string, { count: number; tokens: number }>;

export const REFLECTION_COVERAGE_DROP_RANK: Record<ReflectionCoverageTier, number> = {
	strong: 0,
	partial: 1,
	none: 2,
};

export function reflectionSupportCounts(reflections: readonly Reflection[]): Map<string, number> {
	const counts = new Map<string, number>();
	for (const reflection of reflections) {
		const uniqueIds = new Set(reflection.supportingObservationIds);
		for (const id of uniqueIds) counts.set(id, (counts.get(id) ?? 0) + 1);
	}
	return counts;
}

export function reflectionCoverageTierForCount(count: number): ReflectionCoverageTier {
	if (count <= 0) return "none";
	if (count === 1) return "partial";
	return "strong";
}

export function reflectionCoverageMap(
	observations: readonly Observation[],
	reflections: readonly Reflection[],
): Map<string, ReflectionCoverageTier> {
	const counts = reflectionSupportCounts(reflections);
	return new Map(observations.map((observation) => [
		observation.id,
		reflectionCoverageTierForCount(counts.get(observation.id) ?? 0),
	]));
}

function emptyCoverageBucket(): CoverageBucket {
	return {
		none: { count: 0, tokens: 0 },
		partial: { count: 0, tokens: 0 },
		strong: { count: 0, tokens: 0 },
	};
}

export function summarizeCoverage(
	observations: readonly Observation[],
	coverageById: ReadonlyMap<string, ReflectionCoverageTier>,
): CoverageBucket {
	const summary = emptyCoverageBucket();
	for (const observation of observations) {
		const tier = coverageById.get(observation.id) ?? "none";
		const bucket = summary[tier];
		bucket.count++;
		bucket.tokens += observationTokenEstimate(observation);
	}
	return summary;
}

export function summarizeCoverageForIds(
	ids: readonly string[],
	observations: readonly Observation[],
	coverageById: ReadonlyMap<string, ReflectionCoverageTier>,
): CoverageBucket {
	const idSet = new Set(ids);
	const selected = observations.filter((observation) => idSet.has(observation.id));
	return summarizeCoverage(selected, coverageById);
}

function emptyCoverageTransitionSummary(): CoverageTransitionSummary {
	return {};
}

export function summarizeCoverageTransitions(
	observations: readonly Observation[],
	before: ReadonlyMap<string, ReflectionCoverageTier>,
	after: ReadonlyMap<string, ReflectionCoverageTier>,
): CoverageTransitionSummary {
	const summary = emptyCoverageTransitionSummary();
	for (const observation of observations) {
		const from = before.get(observation.id) ?? "none";
		const to = after.get(observation.id) ?? "none";
		if (from === to) continue;
		const key = `${from}->${to}`;
		const bucket = summary[key] ?? { count: 0, tokens: 0 };
		bucket.count++;
		bucket.tokens += observationTokenEstimate(observation);
		summary[key] = bucket;
	}
	return summary;
}

export function observationToMemoryAgentLine(
	observation: Observation,
	coverage: ReflectionCoverageTier,
): string {
	return `[${observation.id}] ${observation.timestamp} [coverage: ${coverage}] ${observation.content}`;
}

export function coverageTierForObservation(
	observation: Observation,
	coverageById: ReadonlyMap<string, ReflectionCoverageTier>,
): ReflectionCoverageTier {
	return coverageById.get(observation.id) ?? "none";
}
