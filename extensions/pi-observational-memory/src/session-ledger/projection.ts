import { foldLedger } from "./fold.js";
import { observationTokenSum } from "./memory-tokens.js";
import { entryIndexById } from "./progress.js";
import {
	OM_FOLDED,
	isMemoryDetails,
	isReflectionsRewrittenData,
	normalizeObservationsRecordedData,
	normalizeReflectionsRecordedData,
	type Entry,
	type MemoryDetails,
	type Observation,
	type Reflection,
} from "./types.js";
import { reflectionId as typedReflectionId } from "../memory/ids.js";

export type Projection = {
	observations: Observation[];
	reflections: Reflection[];
};

export type ContextProjectionDiff = {
	observationsOnlyInNextContext: Observation[];
	reflectionsOnlyInNextContext: Reflection[];
	observationsOnlyInContext: Observation[];
};

export type NextContextProjection = Projection;

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
	const retiredReflectionIds = new Set<string>();

	for (const entry of entries) {
		const observationsData = entry.type === "custom" && entry.customType === "om.observations.recorded" ? normalizeObservationsRecordedData(entry.data) : undefined;
		if (observationsData && isCoveredAtOrBefore(entry as Entry & { data: { coversUpToId: string } }, indexes, boundaries.observationsThroughIndex)) {
			for (const observation of observationsData.observations) {
				if (observationsById.has(observation.id)) continue;
				observationsById.add(observation.id);
				observations.push(observation);
			}
			continue;
		}

		const reflectionsData = entry.type === "custom" && entry.customType === "om.reflections.recorded" ? normalizeReflectionsRecordedData(entry.data, entry.timestamp ?? "") : undefined;
		if (reflectionsData && isCoveredAtOrBefore(entry as Entry & { data: { coversUpToId: string } }, indexes, boundaries.reflectionsThroughIndex)) {
			for (const reflection of reflectionsData.reflections) {
				if (reflectionsById.has(reflection.id)) continue;
				reflectionsById.add(reflection.id);
				reflections.push(reflection);
			}
			continue;
		}

		if (entry.type === "custom" && entry.customType === "om.reflections.rewritten" && isReflectionsRewrittenData(entry.data)) {
			for (const reflectionId of entry.data.retiredReflectionIds) retiredReflectionIds.add(typedReflectionId(reflectionId));
			continue;
		}
	}

	return {
		observations,
		reflections: reflections.filter((reflection) => !retiredReflectionIds.has(reflection.id)),
	};
}

function projectionFromMemoryDetails(details: MemoryDetails): Projection {
	return {
		observations: [],
		reflections: details.reflections.map((reflection) => ({ ...reflection })),
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

export function nextContextProjection(_entries: Entry[], projection: Projection): NextContextProjection {
	return {
		reflections: projection.reflections,
		observations: [],
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
		observations: [],
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
