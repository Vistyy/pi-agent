export const OM_OBSERVATIONS_RECORDED = "om.observations.recorded";
export const OM_REFLECTIONS_RECORDED = "om.reflections.recorded";
export const OM_REFLECTIONS_REVIEWED = "om.reflections.reviewed";
export const OM_OBSERVATIONS_DROPPED = "om.observations.dropped";
export const OM_OBSERVATIONS_FLAGGED = "om.observations.flagged";
export const OM_FOLDED = "om.folded";

export const MEMORY_ID_PATTERN = /^[a-f0-9]{12}$/;

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

export type Observation = {
	id: string;
	content: string;
	timestamp: string;
	sourceEntryIds: string[];
};

export type Reflection = {
	id: string;
	content: string;
	supportingObservationIds: string[];
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

const OBSERVATION_FLAG_REASON_MAX_LENGTH = 240;

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
	| typeof OM_OBSERVATIONS_FLAGGED;

export function isNonEmptyString(value: unknown): value is string {
	return typeof value === "string" && value.length > 0;
}

export function isNonEmptyStringArray(value: unknown): value is string[] {
	return Array.isArray(value) && value.length > 0 && value.every(isNonEmptyString);
}

export function isMemoryId(value: unknown): value is string {
	return typeof value === "string" && MEMORY_ID_PATTERN.test(value);
}

function isTokenCount(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === "object";
}

export function isObservation(value: unknown): value is Observation {
	if (!isPlainRecord(value)) return false;
	return (
		isMemoryId(value.id) &&
		isNonEmptyString(value.content) &&
		isNonEmptyString(value.timestamp) &&
		isNonEmptyStringArray(value.sourceEntryIds)
	);
}

export function isReflection(value: unknown): value is Reflection {
	if (!isPlainRecord(value)) return false;
	return (
		isMemoryId(value.id) &&
		isNonEmptyString(value.content) &&
		!/\r|\n/.test(value.content) &&
		isNonEmptyStringArray(value.supportingObservationIds)
	);
}

export function isObservationsRecordedData(value: unknown): value is ObservationsRecordedEntryData {
	if (!isPlainRecord(value)) return false;
	return (
		Array.isArray(value.observations) &&
		value.observations.every(isObservation) &&
		isNonEmptyString(value.coversUpToId)
	);
}

export function isReflectionsRecordedData(value: unknown): value is ReflectionsRecordedEntryData {
	if (!isPlainRecord(value)) return false;
	return (
		Array.isArray(value.reflections) &&
		value.reflections.length > 0 &&
		value.reflections.every(isReflection) &&
		isNonEmptyString(value.coversUpToId)
	);
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
