import {
	isObservationsDroppedData,
	isObservationsFlaggedData,
	normalizeObservationFlagReason,
	normalizeObservationsRecordedData,
	normalizeReflectionsRecordedData,
	OM_OBSERVATIONS_DROPPED,
	OM_OBSERVATIONS_FLAGGED,
	OM_OBSERVATIONS_RECORDED,
	OM_REFLECTIONS_RECORDED,
	type Entry,
	type Observation,
	type Reflection,
} from "./types.js";
import { observationId as typedObservationId } from "../memory/ids.js";

export type FoldLedgerOptions = {
	/** Fold entries from branch root through this entry id, inclusive. Omit to fold through branch tip. */
	upToEntryId?: string;
	/** Only include observation follow-up flags appended after this ledger index. Omit to include all flags. */
	pendingFlagsAfterIndex?: number;
};

export type FoldedLedger = {
	/** All first-valid observation records encountered through the fold boundary, including dropped observations. */
	observations: Observation[];
	/** Observation records not tombstoned by a folded drop entry. */
	activeObservations: Observation[];
	/** Tombstoned observation ids, including ids that may not have a corresponding folded observation. */
	droppedObservationIds: Set<string>;
	/** Observation ids flagged for reflector follow-up, including ids that may not have a corresponding folded observation. */
	flaggedObservationIds: Set<string>;
	/** Follow-up reasons by flagged observation id. Reasons are explanatory context, not deterministic routing. */
	flaggedObservationReasonsById: Map<string, string[]>;
	/** All first-valid reflection records encountered through the fold boundary. */
	reflections: Reflection[];
	/** All first-valid observation records by id, including dropped observations. */
	observationsById: Map<string, Observation>;
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
	const droppedObservationIds = new Set<string>();
	const flaggedObservationIds = new Set<string>();
	const flaggedObservationReasonsById = new Map<string, string[]>();
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

		if (isCustomEntry(entry, OM_OBSERVATIONS_DROPPED)) {
			if (!isObservationsDroppedData(entry.data)) continue;
			for (const id of entry.data.observationIds) droppedObservationIds.add(typedObservationId(id));
			continue;
		}

		if (isCustomEntry(entry, OM_OBSERVATIONS_FLAGGED)) {
			if (!isObservationsFlaggedData(entry.data)) continue;
			if (options.pendingFlagsAfterIndex !== undefined && i <= options.pendingFlagsAfterIndex) continue;
			const reason = normalizeObservationFlagReason(entry.data.reason);
			for (const id of entry.data.observationIds) {
				const observationId = typedObservationId(id);
				flaggedObservationIds.add(observationId);
				flaggedObservationReasonsById.set(observationId, [
					...(flaggedObservationReasonsById.get(observationId) ?? []),
					reason,
				].slice(-3));
			}
		}
	}

	for (const observationId of droppedObservationIds) {
		flaggedObservationIds.delete(observationId);
		flaggedObservationReasonsById.delete(observationId);
	}

	const observations = Array.from(observationsById.values());
	const activeObservations = observations.filter((observation) => !droppedObservationIds.has(observation.id));
	const reflections = Array.from(reflectionsById.values());

	return {
		observations,
		activeObservations,
		droppedObservationIds,
		flaggedObservationIds,
		flaggedObservationReasonsById,
		reflections,
		observationsById,
		reflectionsById,
	};
}
