import { describe, expect, it } from "vitest";

import {
	OM_FOLDED,
	OM_OBSERVATIONS_DROPPED,
	OM_OBSERVATIONS_FLAGGED,
	OM_OBSERVATIONS_RECORDED,
	OM_REFLECTIONS_RECORDED,
	OM_REFLECTIONS_REVIEWED,
	OM_REFLECTIONS_REWRITTEN,
	buildObservationsDroppedData,
	buildObservationsFlaggedData,
	buildObservationsRecordedData,
	buildReflectionsRecordedData,
	buildReflectionsReviewedData,
	buildReflectionsRewrittenData,
	isMemoryDetails,
	isObservationsDroppedData,
	isObservationsDroppedEntry,
	isObservationsFlaggedData,
	isObservationsFlaggedEntry,
	isObservationsRecordedData,
	isObservationsRecordedEntry,
	isObservation,
	isReflection,
	isReflectionsRecordedData,
	isReflectionsRecordedEntry,
	isReflectionsReviewedData,
	isReflectionsReviewedEntry,
	isReflectionsRewrittenData,
	isReflectionsRewrittenEntry,
} from "../src/session-ledger/index.js";
import {
	memoryDetails,
	observation,
	observationsDroppedEntry,
	observationsFlaggedEntry,
	observationsRecordedEntry,
	reflection,
	reflectionsRecordedEntry,
	reflectionsReviewedEntry,
	reflectionsRewrittenEntry,
} from "./fixtures/session.js";

describe("session-ledger type guards and builders", () => {
	it("exports the custom type constants", () => {
		expect(OM_OBSERVATIONS_RECORDED).toBe("om.observations.recorded");
		expect(OM_REFLECTIONS_RECORDED).toBe("om.reflections.recorded");
		expect(OM_REFLECTIONS_REVIEWED).toBe("om.reflections.reviewed");
		expect(OM_REFLECTIONS_REWRITTEN).toBe("om.reflections.rewritten");
		expect(OM_OBSERVATIONS_DROPPED).toBe("om.observations.dropped");
		expect(OM_OBSERVATIONS_FLAGGED).toBe("om.observations.flagged");
		expect(OM_FOLDED).toBe("om.folded");
	});

	it("accepts valid observation records and rejects observations without source ids", () => {
		expect(isObservation(observation("aaaaaaaaaaaa"))).toBe(true);
		expect(isObservation({ ...observation("bbbbbbbbbbbb"), sourceEntryIds: [] })).toBe(false);
		expect(isObservation({ ...observation("cccccccccccc"), sourceEntryIds: undefined })).toBe(false);
	});

	it("accepts valid reflection records", () => {
		expect(isReflection(reflection("eeeeeeeeeeee", ["aaaaaaaaaaaa"]))).toBe(true);
		expect(isReflection({ ...reflection("ffffffffffff"), sources: undefined })).toBe(false);
	});

	it("accepts non-empty ledger entry data", () => {
		expect(isObservationsRecordedData({ observations: [observation("aaaaaaaaaaaa")], coversUpToId: "raw-1" })).toBe(true);
		expect(isReflectionsRecordedData({ reflections: [reflection("eeeeeeeeeeee", ["aaaaaaaaaaaa"])], coversUpToId: "raw-2" })).toBe(true);
		expect(isReflectionsReviewedData({ coversUpToId: "raw-2" })).toBe(true);
		expect(isReflectionsRewrittenData({ retiredReflectionIds: ["ref_eeeeeeeeeeee"], newReflectionIds: ["ref_ffffffffffff"], retainedSourceIds: ["obs_aaaaaaaaaaaa"], discardedReflectionIds: ["ref_eeeeeeeeeeee"], discardedSummary: "Retired stale duplicate." })).toBe(true);
		expect(isObservationsDroppedData({ observationIds: ["aaaaaaaaaaaa"], coversUpToId: "ref-entry-1" })).toBe(true);
		expect(isObservationsFlaggedData({ observationIds: ["aaaaaaaaaaaa"], reason: "Reflection omitted exact error path." })).toBe(true);
	});

	it("rejects empty ledger entry data so no empty progress entries can be appended", () => {
		expect(isObservationsRecordedData({ observations: [], coversUpToId: "raw-1" })).toBe(true);
		expect(isReflectionsRecordedData({ reflections: [], coversUpToId: "raw-1" })).toBe(false);
		expect(isReflectionsRewrittenData({ retiredReflectionIds: [], newReflectionIds: ["ref_ffffffffffff"], retainedSourceIds: ["obs_aaaaaaaaaaaa"], discardedReflectionIds: ["ref_eeeeeeeeeeee"], discardedSummary: "Retired stale duplicate." })).toBe(false);
		expect(isObservationsDroppedData({ observationIds: [], coversUpToId: "raw-1" })).toBe(false);
		expect(isObservationsFlaggedData({ observationIds: [], reason: "Reflection omitted exact error path." })).toBe(false);
		expect(isObservationsFlaggedData({ observationIds: ["aaaaaaaaaaaa"], reason: "" })).toBe(false);
		expect(isObservationsFlaggedData({ observationIds: ["aaaaaaaaaaaa"], reason: "line one\nline two" })).toBe(true);
	});

	it("builders return marker data for empty observations and undefined for other empty arrays", () => {
		expect(buildObservationsRecordedData([], "raw-1")).toEqual({ observations: [], coversUpToId: "raw-1" });
		expect(buildReflectionsRecordedData([], "raw-1")).toBeUndefined();
		expect(buildReflectionsReviewedData("raw-1")).toEqual({ coversUpToId: "raw-1" });
		expect(buildReflectionsRewrittenData({ retiredReflectionIds: ["ref_eeeeeeeeeeee"], newReflectionIds: ["ref_ffffffffffff"], retainedSourceIds: ["obs_aaaaaaaaaaaa"], discardedReflectionIds: ["ref_eeeeeeeeeeee"], discardedSummary: "Retired stale duplicate." })).toEqual({ retiredReflectionIds: ["ref_eeeeeeeeeeee"], newReflectionIds: ["ref_ffffffffffff"], retainedSourceIds: ["obs_aaaaaaaaaaaa"], discardedReflectionIds: ["ref_eeeeeeeeeeee"], discardedSummary: "Retired stale duplicate." });
		expect(buildReflectionsRewrittenData({ retiredReflectionIds: [], newReflectionIds: ["ref_ffffffffffff"], retainedSourceIds: ["obs_aaaaaaaaaaaa"], discardedReflectionIds: ["ref_eeeeeeeeeeee"], discardedSummary: "Retired stale duplicate." })).toBeUndefined();
		expect(buildObservationsDroppedData([], "raw-1")).toBeUndefined();
		expect(buildObservationsFlaggedData([], "Reflection omitted exact error path.")).toBeUndefined();
		expect(buildObservationsDroppedData(["aaaaaaaaaaaa"], "ref-entry-1")).toEqual({ observationIds: ["aaaaaaaaaaaa"], coversUpToId: "ref-entry-1" });
		expect(buildObservationsFlaggedData(["aaaaaaaaaaaa"], ` ${"a".repeat(300)}\nmore detail`)).toEqual({ observationIds: ["aaaaaaaaaaaa"], reason: "a".repeat(240) });
	});

	it("recognizes memory entries", () => {
		expect(isObservationsRecordedEntry(observationsRecordedEntry("om-aaaaaaaaaaaa", { observations: [observation("aaaaaaaaaaaa")], coversUpToId: "raw-1" }))).toBe(true);
		expect(isReflectionsRecordedEntry(reflectionsRecordedEntry("om-eeeeeeeeeeee", { reflections: [reflection("eeeeeeeeeeee", ["aaaaaaaaaaaa"])], coversUpToId: "raw-1" }))).toBe(true);
		expect(isReflectionsReviewedEntry(reflectionsReviewedEntry("om-reviewed", { coversUpToId: "raw-1" }))).toBe(true);
		expect(isReflectionsRewrittenEntry(reflectionsRewrittenEntry("om-rewrite", { retiredReflectionIds: ["ref_eeeeeeeeeeee"], newReflectionIds: ["ref_ffffffffffff"], retainedSourceIds: ["obs_aaaaaaaaaaaa"], discardedReflectionIds: ["ref_eeeeeeeeeeee"], discardedSummary: "Retired stale duplicate." }))).toBe(true);
		expect(isObservationsDroppedEntry(observationsDroppedEntry("om-drop-1", { observationIds: ["aaaaaaaaaaaa"], coversUpToId: "om-eeeeeeeeeeee" }))).toBe(true);
		expect(isObservationsFlaggedEntry(observationsFlaggedEntry("om-flag-1", { observationIds: ["aaaaaaaaaaaa"], reason: "Reflection omitted exact error path." }))).toBe(true);
	});

	it("accepts flat folded memory details", () => {
		expect(isMemoryDetails(memoryDetails({ fullFold: true, observations: [observation("aaaaaaaaaaaa")], reflections: [reflection("eeeeeeeeeeee", ["aaaaaaaaaaaa"])] }))).toBe(true);
	});
});
