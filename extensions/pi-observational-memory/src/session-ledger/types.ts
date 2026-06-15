export const OM_OBSERVATIONS_RECORDED = "om.observations.recorded";
export const OM_REFLECTIONS_RECORDED = "om.reflections.recorded";
export const OM_REFLECTIONS_REVIEWED = "om.reflections.reviewed";
export const OM_OBSERVATIONS_DROPPED = "om.observations.dropped";
export const OM_OBSERVATIONS_FLAGGED = "om.observations.flagged";
export const OM_OBSERVATIONS_PINNED = "om.observations.pinned";
export const OM_OBSERVATIONS_UNPINNED = "om.observations.unpinned";
export const OM_OBSERVATIONS_CURATED = "om.observations.curated";
export const OM_FOLDED = "om.folded";

import { isLegacyMemoryId, isObservationId, isReflectionId, observationId, reflectionId } from "../memory/ids.js";

export type Entry = {
	type: string;
	id: string;
	timestamp?: string;
	message?: unknown;
	content?: unknown;
	customType?: string;
	summary?: unknown;
	fromId?: string;
	data?: unknown;
	details?: unknown;
	firstKeptEntryId?: string;
};

export type MemoryRecordKind = "observation" | "reflection";

export type MemoryRecordBase = {
	id: string;
	kind: MemoryRecordKind;
	content: string;
	createdAt: string;
	sources: string[];
};

export type Observation = MemoryRecordBase & {
	id: string;
	kind: "observation";
	/** Observation event time. Kept separately while prompts/status still render observation timestamps. */
	timestamp: string;
	/** Source ledger entry ids. Mirrors sources until source entries get typed ids. */
	sourceEntryIds: string[];
};

export type Reflection = MemoryRecordBase & {
	id: string;
	kind: "reflection";
};

export type ObservationsRecordedEntryData = {
	observations: Observation[];
	coversUpToId: string;
};

export type ReflectionsRecordedEntryData = {
	reflections: Reflection[];
	coversUpToId: string;
};

export type ReflectionsReviewedEntryData = {
	coversUpToId: string;
};

export type ObservationsDroppedEntryData = {
	observationIds: string[];
	coversUpToId: string;
};

export type ObservationsFlaggedEntryData = {
	observationIds: string[];
	/** Short one-line explanation for reflector follow-up. Used as context, not deterministic routing. */
	reason: string;
};

export type ObservationsPinnedEntryData = {
	observationIds: string[];
	/** Short one-line explanation for forcing reviewed observations into next context. */
	reason: string;
};

export type ObservationsUnpinnedEntryData = {
	observationIds: string[];
	/** Short one-line explanation for no longer forcing reviewed observations into next context. */
	reason: string;
};

export type ObservationsCuratedEntryData = {
	coversUpToId: string;
};

const OBSERVATION_FLAG_REASON_MAX_LENGTH = 240;
const OBSERVATION_PIN_REASON_MAX_LENGTH = 240;

export type MemoryDetails = {
	type: typeof OM_FOLDED;
	fullFold: boolean;
	observations: Observation[];
	reflections: Reflection[];
};

export type MemoryCustomType =
	| typeof OM_OBSERVATIONS_RECORDED
	| typeof OM_REFLECTIONS_RECORDED
	| typeof OM_REFLECTIONS_REVIEWED
	| typeof OM_OBSERVATIONS_DROPPED
	| typeof OM_OBSERVATIONS_FLAGGED
	| typeof OM_OBSERVATIONS_PINNED
	| typeof OM_OBSERVATIONS_UNPINNED
	| typeof OM_OBSERVATIONS_CURATED;

export function isNonEmptyString(value: unknown): value is string {
	return typeof value === "string" && value.length > 0;
}

export function isNonEmptyStringArray(value: unknown): value is string[] {
	return Array.isArray(value) && value.length > 0 && value.every(isNonEmptyString);
}

export function isMemoryId(value: unknown): value is string {
	return isLegacyMemoryId(value) || isObservationId(value) || isReflectionId(value);
}

function isTokenCount(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === "object";
}

export function normalizeObservation(value: unknown): Observation | undefined {
	if (!isPlainRecord(value)) return undefined;
	if (
		!isMemoryId(value.id) ||
		!isNonEmptyString(value.content) ||
		!isNonEmptyString(value.timestamp) ||
		!isNonEmptyStringArray(value.sourceEntryIds)
	) return undefined;
	return {
		id: observationId(value.id),
		kind: "observation",
		content: value.content,
		createdAt: isNonEmptyString(value.createdAt) ? value.createdAt : value.timestamp,
		sources: value.sourceEntryIds,
		timestamp: value.timestamp,
		sourceEntryIds: value.sourceEntryIds,
	};
}

export function isObservation(value: unknown): value is Observation {
	return !!normalizeObservation(value);
}

export function normalizeReflection(value: unknown, createdAt: string): Reflection | undefined {
	if (!isPlainRecord(value)) return undefined;
	if (!isMemoryId(value.id) || !isNonEmptyString(value.content) || /\r|\n/.test(value.content)) return undefined;
	const rawSources = isNonEmptyStringArray(value.sources)
		? value.sources
		: isNonEmptyStringArray(value.supportingObservationIds)
			? value.supportingObservationIds.map(observationId)
			: undefined;
	if (!rawSources) return undefined;
	const sources = rawSources.map((source) => isLegacyMemoryId(source) ? observationId(source) : source);
	if (!sources.every((source) => isObservationId(source) || isReflectionId(source))) return undefined;
	return {
		id: reflectionId(value.id),
		kind: "reflection",
		content: value.content,
		sources,
		createdAt: isNonEmptyString(value.createdAt) ? value.createdAt : createdAt,
	};
}

export function isReflection(value: unknown): value is Reflection {
	return !!normalizeReflection(value, "1970-01-01T00:00:00.000Z");
}

export function normalizeObservationsRecordedData(value: unknown): ObservationsRecordedEntryData | undefined {
	if (!isPlainRecord(value) || !Array.isArray(value.observations) || !isNonEmptyString(value.coversUpToId)) return undefined;
	const observations = value.observations.map(normalizeObservation);
	if (observations.some((observation) => !observation)) return undefined;
	return { observations: observations as Observation[], coversUpToId: value.coversUpToId };
}

export function isObservationsRecordedData(value: unknown): value is ObservationsRecordedEntryData {
	return !!normalizeObservationsRecordedData(value);
}

export function normalizeReflectionsRecordedData(value: unknown, createdAt: string): ReflectionsRecordedEntryData | undefined {
	if (!isPlainRecord(value) || !Array.isArray(value.reflections) || value.reflections.length === 0 || !isNonEmptyString(value.coversUpToId)) return undefined;
	const reflections = value.reflections.map((reflection) => normalizeReflection(reflection, createdAt));
	if (reflections.some((reflection) => !reflection)) return undefined;
	return { reflections: reflections as Reflection[], coversUpToId: value.coversUpToId };
}

export function isReflectionsRecordedData(value: unknown): value is ReflectionsRecordedEntryData {
	return !!normalizeReflectionsRecordedData(value, "1970-01-01T00:00:00.000Z");
}

export function isReflectionsReviewedData(value: unknown): value is ReflectionsReviewedEntryData {
	if (!isPlainRecord(value)) return false;
	return isNonEmptyString(value.coversUpToId);
}

export function isObservationsDroppedData(value: unknown): value is ObservationsDroppedEntryData {
	if (!isPlainRecord(value)) return false;
	return isNonEmptyStringArray(value.observationIds) && isNonEmptyString(value.coversUpToId);
}

export function normalizeObservationFlagReason(value: string): string {
	return value.replace(/[\r\n]+/g, " ").trim().slice(0, OBSERVATION_FLAG_REASON_MAX_LENGTH);
}

export function isObservationFlagReason(value: unknown): value is string {
	return typeof value === "string" && normalizeObservationFlagReason(value).length > 0;
}

export function isObservationsFlaggedData(value: unknown): value is ObservationsFlaggedEntryData {
	if (!isPlainRecord(value)) return false;
	return isNonEmptyStringArray(value.observationIds) && isObservationFlagReason(value.reason);
}

export function normalizeObservationPinReason(value: string): string {
	return value.replace(/[\r\n]+/g, " ").trim().slice(0, OBSERVATION_PIN_REASON_MAX_LENGTH);
}

export function isObservationPinReason(value: unknown): value is string {
	return typeof value === "string" && normalizeObservationPinReason(value).length > 0;
}

export function isObservationsPinnedData(value: unknown): value is ObservationsPinnedEntryData {
	if (!isPlainRecord(value)) return false;
	return isNonEmptyStringArray(value.observationIds) && isObservationPinReason(value.reason);
}

export function isObservationsUnpinnedData(value: unknown): value is ObservationsUnpinnedEntryData {
	if (!isPlainRecord(value)) return false;
	return isNonEmptyStringArray(value.observationIds) && isObservationPinReason(value.reason);
}

export function isObservationsCuratedData(value: unknown): value is ObservationsCuratedEntryData {
	if (!isPlainRecord(value)) return false;
	return isNonEmptyString(value.coversUpToId);
}

export function isMemoryDetails(value: unknown): value is MemoryDetails {
	if (!isPlainRecord(value)) return false;
	return (
		value.type === OM_FOLDED &&
		typeof value.fullFold === "boolean" &&
		Array.isArray(value.observations) &&
		value.observations.every(isObservation) &&
		Array.isArray(value.reflections) &&
		value.reflections.every(isReflection)
	);
}

export function isObservationsRecordedEntry(entry: Entry): entry is Entry & {
	type: "custom";
	customType: typeof OM_OBSERVATIONS_RECORDED;
	data: ObservationsRecordedEntryData;
} {
	return entry.type === "custom" && entry.customType === OM_OBSERVATIONS_RECORDED && isObservationsRecordedData(entry.data);
}

export function isReflectionsRecordedEntry(entry: Entry): entry is Entry & {
	type: "custom";
	customType: typeof OM_REFLECTIONS_RECORDED;
	data: ReflectionsRecordedEntryData;
} {
	return entry.type === "custom" && entry.customType === OM_REFLECTIONS_RECORDED && isReflectionsRecordedData(entry.data);
}

export function isReflectionsReviewedEntry(entry: Entry): entry is Entry & {
	type: "custom";
	customType: typeof OM_REFLECTIONS_REVIEWED;
	data: ReflectionsReviewedEntryData;
} {
	return entry.type === "custom" && entry.customType === OM_REFLECTIONS_REVIEWED && isReflectionsReviewedData(entry.data);
}

export function isObservationsDroppedEntry(entry: Entry): entry is Entry & {
	type: "custom";
	customType: typeof OM_OBSERVATIONS_DROPPED;
	data: ObservationsDroppedEntryData;
} {
	return entry.type === "custom" && entry.customType === OM_OBSERVATIONS_DROPPED && isObservationsDroppedData(entry.data);
}

export function isObservationsFlaggedEntry(entry: Entry): entry is Entry & {
	type: "custom";
	customType: typeof OM_OBSERVATIONS_FLAGGED;
	data: ObservationsFlaggedEntryData;
} {
	return entry.type === "custom" && entry.customType === OM_OBSERVATIONS_FLAGGED && isObservationsFlaggedData(entry.data);
}

export function isObservationsPinnedEntry(entry: Entry): entry is Entry & {
	type: "custom";
	customType: typeof OM_OBSERVATIONS_PINNED;
	data: ObservationsPinnedEntryData;
} {
	return entry.type === "custom" && entry.customType === OM_OBSERVATIONS_PINNED && isObservationsPinnedData(entry.data);
}

export function isObservationsUnpinnedEntry(entry: Entry): entry is Entry & {
	type: "custom";
	customType: typeof OM_OBSERVATIONS_UNPINNED;
	data: ObservationsUnpinnedEntryData;
} {
	return entry.type === "custom" && entry.customType === OM_OBSERVATIONS_UNPINNED && isObservationsUnpinnedData(entry.data);
}

export function isObservationsCuratedEntry(entry: Entry): entry is Entry & {
	type: "custom";
	customType: typeof OM_OBSERVATIONS_CURATED;
	data: ObservationsCuratedEntryData;
} {
	return entry.type === "custom" && entry.customType === OM_OBSERVATIONS_CURATED && isObservationsCuratedData(entry.data);
}

export function buildObservationsRecordedData(
	observations: Observation[],
	coversUpToId: string,
): ObservationsRecordedEntryData | undefined {
	if (!isNonEmptyString(coversUpToId)) return undefined;
	return { observations, coversUpToId };
}

export function buildReflectionsRecordedData(
	reflections: Reflection[],
	coversUpToId: string,
): ReflectionsRecordedEntryData | undefined {
	if (reflections.length === 0 || !isNonEmptyString(coversUpToId)) return undefined;
	return { reflections, coversUpToId };
}

export function buildReflectionsReviewedData(coversUpToId: string): ReflectionsReviewedEntryData | undefined {
	if (!isNonEmptyString(coversUpToId)) return undefined;
	return { coversUpToId };
}

export function buildObservationsDroppedData(
	observationIds: string[],
	coversUpToId: string,
): ObservationsDroppedEntryData | undefined {
	if (observationIds.length === 0 || !isNonEmptyString(coversUpToId)) return undefined;
	return { observationIds, coversUpToId };
}

export function buildObservationsFlaggedData(
	observationIds: string[],
	reason: string,
): ObservationsFlaggedEntryData | undefined {
	const normalizedReason = normalizeObservationFlagReason(reason);
	if (observationIds.length === 0 || !isObservationFlagReason(normalizedReason)) return undefined;
	return { observationIds, reason: normalizedReason };
}

export function buildObservationsPinnedData(
	observationIds: string[],
	reason: string,
): ObservationsPinnedEntryData | undefined {
	const normalizedReason = normalizeObservationPinReason(reason);
	if (observationIds.length === 0 || !isObservationPinReason(normalizedReason)) return undefined;
	return { observationIds, reason: normalizedReason };
}

export function buildObservationsUnpinnedData(
	observationIds: string[],
	reason: string,
): ObservationsUnpinnedEntryData | undefined {
	const normalizedReason = normalizeObservationPinReason(reason);
	if (observationIds.length === 0 || !isObservationPinReason(normalizedReason)) return undefined;
	return { observationIds, reason: normalizedReason };
}

export function buildObservationsCuratedData(coversUpToId: string): ObservationsCuratedEntryData | undefined {
	if (!isNonEmptyString(coversUpToId)) return undefined;
	return { coversUpToId };
}
