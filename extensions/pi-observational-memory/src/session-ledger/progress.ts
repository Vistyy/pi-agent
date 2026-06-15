import { estimateEntryTokens } from "../memory/token-estimate.js";
import {
	OM_OBSERVATIONS_RECORDED,
	OM_REFLECTIONS_RECORDED,
	type Entry,
	type MemoryCustomType,
} from "./types.js";

const SOURCE_ENTRY_TYPES = new Set(["message", "custom_message", "branch_summary", "compaction"]);

export function isSourceEntry(entry: Entry): boolean {
	return SOURCE_ENTRY_TYPES.has(entry.type);
}

export function entryIndexById(entries: Entry[]): Map<string, number> {
	const idToIndex = new Map<string, number>();
	for (let i = 0; i < entries.length; i++) idToIndex.set(entries[i].id, i);
	return idToIndex;
}

export function entryIndexForId(entries: Entry[], entryId: string | undefined): number {
	if (!entryId) return -1;
	const idx = entryIndexById(entries).get(entryId);
	return idx ?? -1;
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function isValidCoverageEntry(entry: Entry, customType: MemoryCustomType): entry is Entry & { data: { coversUpToId: string } } {
	if (entry.type !== "custom" || entry.customType !== customType) return false;
	if (!isObject(entry.data) || typeof entry.data.coversUpToId !== "string") return false;

	if (customType === OM_OBSERVATIONS_RECORDED) return Array.isArray(entry.data.observations);
	if (customType === OM_REFLECTIONS_RECORDED) return Array.isArray(entry.data.reflections);
	return false;
}

export function latestCoverageIndex(entries: Entry[], customType: MemoryCustomType): number {
	const idToIndex = entryIndexById(entries);
	let latest = -1;

	for (const entry of entries) {
		if (!isValidCoverageEntry(entry, customType)) continue;
		const coveredIndex = idToIndex.get(entry.data.coversUpToId);
		if (coveredIndex === undefined) continue;
		if (coveredIndex > latest) latest = coveredIndex;
	}

	return latest;
}

export function latestCoverageMarkerId(entries: Entry[], customType: MemoryCustomType): string | undefined {
	const idToIndex = entryIndexById(entries);
	let latestIndex = -1;
	let latestMarkerId: string | undefined;

	for (const entry of entries) {
		if (!isValidCoverageEntry(entry, customType)) continue;
		const coveredIndex = idToIndex.get(entry.data.coversUpToId);
		if (coveredIndex === undefined) continue;
		if (coveredIndex > latestIndex) {
			latestIndex = coveredIndex;
			latestMarkerId = entry.data.coversUpToId;
		}
	}

	return latestMarkerId;
}

export function sourceEntriesAfterIndex(entries: Entry[], index: number): Entry[] {
	return entries.slice(index + 1).filter(isSourceEntry);
}

export function sourceEntryCountAfterIndex(entries: Entry[], index: number): number {
	return sourceEntriesAfterIndex(entries, index).length;
}

export function sourceEntryCountSinceCoverage(entries: Entry[], customType: MemoryCustomType): number {
	return sourceEntryCountAfterIndex(entries, latestCoverageIndex(entries, customType));
}

export function sourceEntryCountSinceObservationCoverage(entries: Entry[]): number {
	return sourceEntryCountSinceCoverage(entries, OM_OBSERVATIONS_RECORDED);
}

export function latestReflectionReviewIndex(entries: Entry[]): number {
	return latestCoverageIndex(entries, OM_REFLECTIONS_RECORDED);
}

export function latestReflectionReviewMarkerId(entries: Entry[]): string | undefined {
	const index = latestReflectionReviewIndex(entries);
	return index >= 0 ? entries[index]?.id : undefined;
}

export function sourceTokensAfterIndex(entries: Entry[], index: number): number {
	let total = 0;
	for (const entry of sourceEntriesAfterIndex(entries, index)) total += estimateEntryTokens(entry);
	return total;
}

export function sourceTokensSinceCoverage(entries: Entry[], customType: MemoryCustomType): number {
	return sourceTokensAfterIndex(entries, latestCoverageIndex(entries, customType));
}

export function sourceTokensSinceObservationCoverage(entries: Entry[]): number {
	return sourceTokensSinceCoverage(entries, OM_OBSERVATIONS_RECORDED);
}

export function sourceEntryCountSinceReflectionReviewCoverage(entries: Entry[]): number {
	return sourceEntryCountAfterIndex(entries, latestReflectionReviewIndex(entries));
}


