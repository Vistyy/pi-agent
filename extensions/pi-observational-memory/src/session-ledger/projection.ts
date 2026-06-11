import { foldLedger } from "./fold.js";
import { observationTokenSum } from "./memory-tokens.js";
import { entryIndexById, latestReflectionReviewIndex } from "./progress.js";
import {
	OM_FOLDED,
	isMemoryDetails,
	isObservationsDroppedEntry,
	isObservationsRecordedEntry,
	isReflectionsRecordedEntry,
	type Entry,
	type MemoryDetails,
	type Observation,
	type Reflection,
} from "./types.js";

export type Projection = {
	observations: Observation[];
	reflections: Reflection[];
};

export type ContextProjectionDiff = {
	observationsOnlyInNextContext: Observation[];
	reflectionsOnlyInNextContext: Reflection[];
	observationsOnlyInContext: Observation[];
};

export type ReviewClassification = {
	reviewed: Observation[];
	unreviewed: Observation[];
};

export type NextContextProjection = Projection & ReviewClassification;

export type CompactionProjectionConfig = {
	observationsPoolMaxTokens: number;
};

export type CompactionProjection = Projection & {
	fullFold: boolean;
	details: MemoryDetails;
};

type FoldBoundaries = {
	observationsThroughIndex: number;
	reflectionsThroughIndex: number;
	dropsThroughIndex: number;
};

function tipIndex(entries: Entry[]): number {
	return entries.length - 1;
}

function entryIndexOrNone(indexes: Map<string, number>, entryId: string | undefined): number {
	return entryId ? indexes.get(entryId) ?? -1 : -1;
}

function coverageIndex(entry: Entry & { data: { coversUpToId: string } }, indexes: Map<string, number>): number {
	return indexes.get(entry.data.coversUpToId) ?? -1;
}

function isAtOrBefore(index: number, boundaryIndex: number): boolean {
	return index >= 0 && boundaryIndex >= 0 && index <= boundaryIndex;
}

function isCoveredAtOrBefore(
	entry: Entry & { data: { coversUpToId: string } },
	indexes: Map<string, number>,
	boundaryIndex: number,
): boolean {
	return isAtOrBefore(coverageIndex(entry, indexes), boundaryIndex);
}

function foldProjection(entries: Entry[], boundaries: FoldBoundaries): Projection {
	const indexes = entryIndexById(entries);
	const observations: Observation[] = [];
	const reflections: Reflection[] = [];
	const observationsById = new Set<string>();
	const reflectionsById = new Set<string>();
	const droppedObservationIds = new Set<string>();

	for (const entry of entries) {
		if (isObservationsRecordedEntry(entry) && isCoveredAtOrBefore(entry, indexes, boundaries.observationsThroughIndex)) {
			for (const observation of entry.data.observations) {
				if (observationsById.has(observation.id)) continue;
				observationsById.add(observation.id);
				observations.push(observation);
			}
			continue;
		}

		if (isReflectionsRecordedEntry(entry) && isCoveredAtOrBefore(entry, indexes, boundaries.reflectionsThroughIndex)) {
			for (const reflection of entry.data.reflections) {
				if (reflectionsById.has(reflection.id)) continue;
				reflectionsById.add(reflection.id);
				reflections.push(reflection);
			}
			continue;
		}

		if (isObservationsDroppedEntry(entry) && isCoveredAtOrBefore(entry, indexes, boundaries.dropsThroughIndex)) {
			for (const observationId of entry.data.observationIds) droppedObservationIds.add(observationId);
		}
	}

	return {
		observations: observations.filter((observation) => !droppedObservationIds.has(observation.id)),
		reflections,
	};
}

function projectionFromMemoryDetails(details: MemoryDetails): Projection {
	return {
		observations: [...details.observations],
		reflections: [...details.reflections],
	};
}

function latestCompactionDetails(entries: Entry[]): MemoryDetails | undefined {
	for (let i = entries.length - 1; i >= 0; i--) {
		const entry = entries[i];
		if (entry.type !== "compaction") continue;
		if (isMemoryDetails(entry.details)) return entry.details;
	}
	return undefined;
}

export function fullProjection(entries: Entry[], upToEntryId?: string): Projection {
	const indexes = entryIndexById(entries);
	const throughIndex = upToEntryId ? entryIndexOrNone(indexes, upToEntryId) : tipIndex(entries);
	return foldProjection(entries, {
		observationsThroughIndex: throughIndex,
		reflectionsThroughIndex: throughIndex,
		dropsThroughIndex: throughIndex,
	});
}

export function compactedProjection(entries: Entry[]): Projection {
	const details = latestCompactionDetails(entries);
	return details ? projectionFromMemoryDetails(details) : { observations: [], reflections: [] };
}

export function contextProjection(entries: Entry[]): Projection {
	const context = nextContextProjection(entries, compactedProjection(entries));
	return { observations: context.observations, reflections: context.reflections };
}

export function classifyObservationsByReview(entries: Entry[], observations: Observation[]): ReviewClassification {
	const reviewIndex = latestReflectionReviewIndex(entries);
	if (reviewIndex < 0) return { reviewed: [], unreviewed: [...observations] };

	const indexes = entryIndexById(entries);
	const reviewed: Observation[] = [];
	const unreviewed: Observation[] = [];

	for (const observation of observations) {
		const isReviewed = observation.sourceEntryIds.length > 0 && observation.sourceEntryIds.every((sourceEntryId) => {
			const sourceIndex = indexes.get(sourceEntryId);
			return sourceIndex !== undefined && sourceIndex <= reviewIndex;
		});
		if (isReviewed) reviewed.push(observation);
		else unreviewed.push(observation);
	}

	return { reviewed, unreviewed };
}

export function nextContextProjection(entries: Entry[], projection: Projection): NextContextProjection {
	const classified = classifyObservationsByReview(entries, projection.observations);
	const folded = foldLedger(entries);
	const pinnedReviewed = classified.reviewed.filter((observation) => folded.pinnedObservationIds.has(observation.id));
	return {
		reflections: projection.reflections,
		observations: [...classified.unreviewed, ...pinnedReviewed],
		...classified,
	};
}

export function latestFullFoldBoundaryId(entries: Entry[]): string | undefined {
	const indexes = entryIndexById(entries);
	for (let i = entries.length - 1; i >= 0; i--) {
		const entry = entries[i];
		if (entry.type !== "compaction") continue;
		if (!isMemoryDetails(entry.details)) continue;
		if (!entry.details.fullFold) continue;
		if (!entry.firstKeptEntryId) continue;
		if (!indexes.has(entry.firstKeptEntryId)) continue;
		return entry.firstKeptEntryId;
	}
	return undefined;
}

function mergeProjection(base: Projection, next: Projection): Projection {
	const observationIds = new Set(base.observations.map((observation) => observation.id));
	const reflectionIds = new Set(base.reflections.map((reflection) => reflection.id));
	return {
		observations: [...base.observations, ...next.observations.filter((observation) => !observationIds.has(observation.id))],
		reflections: [...base.reflections, ...next.reflections.filter((reflection) => !reflectionIds.has(reflection.id))],
	};
}

function buildIncrementalCompactionProjection(entries: Entry[], seed: Projection = { observations: [], reflections: [] }): Projection {
	const indexes = entryIndexById(entries);
	const latestFullFoldBoundaryIndex = entryIndexOrNone(indexes, latestFullFoldBoundaryId(entries));
	const folded = foldProjection(entries, {
		observationsThroughIndex: tipIndex(entries),
		reflectionsThroughIndex: tipIndex(entries),
		dropsThroughIndex: latestFullFoldBoundaryIndex,
	});
	return mergeProjection(seed, folded);
}

function shouldFullFold(projection: Projection, config: CompactionProjectionConfig): boolean {
	const observationTokens = observationTokenSum(projection.observations);
	return observationTokens >= config.observationsPoolMaxTokens;
}

function buildFullFoldCompactionProjection(entries: Entry[], firstKeptEntryId: string): Projection {
	return fullProjection(entries, firstKeptEntryId);
}

function withCompactionDetails(context: Projection, detailsProjection: Projection, fullFold: boolean): CompactionProjection {
	const details: MemoryDetails = {
		type: OM_FOLDED,
		fullFold,
		observations: detailsProjection.observations,
		reflections: detailsProjection.reflections,
	};

	return {
		fullFold,
		observations: context.observations,
		reflections: context.reflections,
		details,
	};
}

export function buildNextCompactionProjection(
	entries: Entry[],
	firstKeptEntryId: string,
	config: CompactionProjectionConfig,
	seed: Projection = { observations: [], reflections: [] },
): CompactionProjection {
	const incrementalProjection = buildIncrementalCompactionProjection(entries, mergeProjection(compactedProjection(entries), seed));
	if (!shouldFullFold(incrementalProjection, config)) return withCompactionDetails(nextContextProjection(entries, incrementalProjection), incrementalProjection, false);
	const fullFoldProjection = buildFullFoldCompactionProjection(entries, firstKeptEntryId);
	return withCompactionDetails(nextContextProjection(entries, fullFoldProjection), fullFoldProjection, true);
}

export function diffContextProjection(context: Projection, nextContext: Projection): ContextProjectionDiff {
	const contextObservationIds = new Set(context.observations.map((observation) => observation.id));
	const nextContextObservationIds = new Set(nextContext.observations.map((observation) => observation.id));
	const contextReflectionIds = new Set(context.reflections.map((reflection) => reflection.id));

	return {
		observationsOnlyInNextContext: nextContext.observations.filter((observation) => !contextObservationIds.has(observation.id)),
		reflectionsOnlyInNextContext: nextContext.reflections.filter((reflection) => !contextReflectionIds.has(reflection.id)),
		observationsOnlyInContext: context.observations.filter((observation) => !nextContextObservationIds.has(observation.id)),
	};
}
