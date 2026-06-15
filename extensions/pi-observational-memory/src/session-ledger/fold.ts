import {
	isReflectionsRewrittenData,
	normalizeObservationsRecordedData,
	normalizeReflectionsRecordedData,
	OM_OBSERVATIONS_RECORDED,
	OM_REFLECTIONS_RECORDED,
	OM_REFLECTIONS_REWRITTEN,
	type Entry,
	type Observation,
	type Reflection,
} from "./types.js";
import { reflectionId as typedReflectionId } from "../memory/ids.js";

export type FoldLedgerOptions = {
	/** Fold entries from branch root through this entry id, inclusive. Omit to fold through branch tip. */
	upToEntryId?: string;
};

export type FoldedLedger = {
	/** All first-valid observation records encountered through the fold boundary. */
	observations: Observation[];
	/** Alias kept for reflector input while active observations remain hidden from projection. */
	activeObservations: Observation[];
	/** All first-valid reflection records encountered through the fold boundary that have not been retired by rewrite. */
	reflections: Reflection[];
	/** Reflection ids retired from active projection by rewrite events. */
	retiredReflectionIds: Set<string>;
	/** All first-valid reflection records by id. */
	reflectionsById: Map<string, Reflection>;
};

function foldEndIndex(entries: Entry[], upToEntryId: string | undefined): number {
	if (!upToEntryId) return entries.length - 1;
	const idx = entries.findIndex((entry) => entry.id === upToEntryId);
	return idx === -1 ? entries.length - 1 : idx;
}

function isCustomEntry(entry: Entry, customType: string): boolean {
	return entry.type === "custom" && entry.customType === customType;
}

export function foldLedger(entries: Entry[], options: FoldLedgerOptions = {}): FoldedLedger {
	const observationsById = new Map<string, Observation>();
	const reflectionsById = new Map<string, Reflection>();
	const retiredReflectionIds = new Set<string>();
	const endIdx = foldEndIndex(entries, options.upToEntryId);

	for (let i = 0; i <= endIdx; i++) {
		const entry = entries[i];
		if (!entry) continue;

		if (isCustomEntry(entry, OM_OBSERVATIONS_RECORDED)) {
			const data = normalizeObservationsRecordedData(entry.data);
			if (!data) continue;
			for (const observation of data.observations) {
				if (!observationsById.has(observation.id)) observationsById.set(observation.id, observation);
			}
			continue;
		}

		if (isCustomEntry(entry, OM_REFLECTIONS_RECORDED)) {
			const data = normalizeReflectionsRecordedData(entry.data, entry.timestamp ?? "");
			if (!data) continue;
			for (const reflection of data.reflections) {
				if (!reflectionsById.has(reflection.id)) reflectionsById.set(reflection.id, reflection);
			}
			continue;
		}

		if (isCustomEntry(entry, OM_REFLECTIONS_REWRITTEN)) {
			if (!isReflectionsRewrittenData(entry.data)) continue;
			for (const id of entry.data.retiredReflectionIds) retiredReflectionIds.add(typedReflectionId(id));
		}
	}

	const observations = Array.from(observationsById.values());
	const reflections = Array.from(reflectionsById.values()).filter((reflection) => !retiredReflectionIds.has(reflection.id));

	return {
		observations,
		activeObservations: observations,
		reflections,
		retiredReflectionIds,
		reflectionsById,
	};
}
