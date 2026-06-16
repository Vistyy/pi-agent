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

export type NextContextProjection = Projection;

export type CompactionProjectionConfig = {
	observationsPoolMaxTokens: number;
	recentObservationTailMaxCount?: number;
	recentObservationTailMaxTokens?: number;
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

function recentObservationTail(observations: Observation[], config: CompactionProjectionConfig): Observation[] {
	const maxCount = config.recentObservationTailMaxCount ?? 8;
	const maxTokens = config.recentObservationTailMaxTokens ?? 1_000;
	const tail: Observation[] = [];
	let tokens = 0;
	for (const observation of observations.slice(0, maxCount)) {
		const nextTokens = Math.ceil(observation.content.length / 4);
		if (tail.length > 0 && tokens + nextTokens > maxTokens) break;
		tail.push(observation);
		tokens += nextTokens;
	}
	return tail;
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
	options: { seed?: Projection; recentObservedTail?: Observation[] } = {},
): CompactionProjection {
	const incrementalProjection = buildIncrementalCompactionProjection(entries, mergeProjection(compactedProjection(entries), options.seed ?? { observations: [], reflections: [] }));
	const tail = recentObservationTail(options.recentObservedTail ?? [], config);
	if (!shouldFullFold(incrementalProjection, config)) {
		return withCompactionDetails({ ...nextContextProjection(entries, incrementalProjection), observations: tail }, incrementalProjection, false);
	}
	const fullFoldProjection = buildFullFoldCompactionProjection(entries, firstKeptEntryId);
	return withCompactionDetails({ ...nextContextProjection(entries, fullFoldProjection), observations: tail }, fullFoldProjection, true);
}
