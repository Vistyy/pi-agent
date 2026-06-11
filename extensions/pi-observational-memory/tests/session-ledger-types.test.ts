import { describe, expect, it } from "vitest";

import {
	OM_FOLDED,
	OM_OBSERVATIONS_DROPPED,
	OM_OBSERVATIONS_FLAGGED,
	OM_OBSERVATIONS_RECORDED,
	OM_REFLECTIONS_RECORDED,
	OM_REFLECTIONS_REVIEWED,
	buildObservationsDroppedData,
	buildObservationsFlaggedData,
	buildObservationsRecordedData,
	buildReflectionsRecordedData,
	buildReflectionsReviewedData,
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
} from "./fixtures/session.js";

describe("session-ledger type guards and builders", () => {
	it("exports the custom type constants", () => {
		expect(OM_OBSERVATIONS_RECORDED).toBe("om.observations.recorded");
		expect(OM_REFLECTIONS_RECORDED).toBe("om.reflections.recorded");
		expect(OM_REFLECTIONS_REVIEWED).toBe("om.reflections.reviewed");
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
		expect(isReflection({ ...reflection("ffffffffffff"), supportingObservationIds: undefined })).toBe(false);
	});

	it("accepts non-empty ledger entry data", () => {
		const obsData = { observations: [observation("aaaaaaaaaaaa")], coversUpToId: "raw-1" };
		const refData = { reflections: [reflection("eeeeeeeeeeee", ["aaaaaaaaaaaa"])], coversUpToId: "raw-2" };
		const reviewedData = { coversUpToId: "raw-2" };
		const dropData = { observationIds: ["aaaaaaaaaaaa"], coversUpToId: "ref-entry-1" };
		const flaggedData = { observationIds: ["aaaaaaaaaaaa"], reason: "Reflection omitted exact error path." };

		expect(isObservationsRecordedData(obsData)).toBe(true);
		expect(isReflectionsRecordedData(refData)).toBe(true);
		expect(isReflectionsReviewedData(reviewedData)).toBe(true);
		expect(isObservationsDroppedData(dropData)).toBe(true);
		expect(isObservationsFlaggedData(flaggedData)).toBe(true);
	});

	it("rejects empty ledger entry data so no empty progress entries can be appended", () => {
		expect(isObservationsRecordedData({ observations: [], coversUpToId: "raw-1" })).toBe(true);
		expect(isReflectionsRecordedData({ reflections: [], coversUpToId: "raw-1" })).toBe(false);
		expect(isObservationsDroppedData({ observationIds: [], coversUpToId: "raw-1" })).toBe(false);
		expect(isObservationsFlaggedData({ observationIds: [], reason: "Reflection omitted exact error path." })).toBe(false);
		expect(isObservationsFlaggedData({ observationIds: ["aaaaaaaaaaaa"], reason: "" })).toBe(false);
		expect(isObservationsFlaggedData({ observationIds: ["aaaaaaaaaaaa"], reason: "line one\nline two" })).toBe(false);
	});

	it("builders return marker data for empty observations and undefined for other empty arrays", () => {
		expect(buildObservationsRecordedData([], "raw-1")).toEqual({ observations: [], coversUpToId: "raw-1" });
		expect(buildReflectionsRecordedData([], "raw-1")).toBeUndefined();
		expect(buildReflectionsReviewedData("raw-1")).toEqual({ coversUpToId: "raw-1" });
		expect(buildObservationsDroppedData([], "raw-1")).toBeUndefined();
		expect(buildObservationsFlaggedData([], "Reflection omitted exact error path.")).toBeUndefined();

		expect(buildObservationsRecordedData([observation("aaaaaaaaaaaa")], "raw-1")).toEqual({
			observations: [observation("aaaaaaaaaaaa")],
			coversUpToId: "raw-1",
		});
		expect(buildReflectionsRecordedData([reflection("eeeeeeeeeeee", ["aaaaaaaaaaaa"])], "raw-1")).toEqual({
			reflections: [reflection("eeeeeeeeeeee", ["aaaaaaaaaaaa"])],
			coversUpToId: "raw-1",
		});
		expect(buildObservationsDroppedData(["aaaaaaaaaaaa"], "ref-entry-1")).toEqual({
			observationIds: ["aaaaaaaaaaaa"],
			coversUpToId: "ref-entry-1",
		});
		expect(buildObservationsFlaggedData(["aaaaaaaaaaaa"], "Reflection omitted exact error path.")).toEqual({
			observationIds: ["aaaaaaaaaaaa"],
			reason: "Reflection omitted exact error path.",
		});
		expect(buildObservationsFlaggedData(["aaaaaaaaaaaa"], ` ${"a".repeat(300)}\nmore detail`)).toEqual({
			observationIds: ["aaaaaaaaaaaa"],
			reason: "a".repeat(240),
		});
	});

	it("recognizes memory entries", () => {
		expect(isObservationsRecordedEntry(observationsRecordedEntry("om-aaaaaaaaaaaa", {
			observations: [observation("aaaaaaaaaaaa")],
			coversUpToId: "raw-1",
		}))).toBe(true);
		expect(isReflectionsRecordedEntry(reflectionsRecordedEntry("om-eeeeeeeeeeee", {
			reflections: [reflection("eeeeeeeeeeee", ["aaaaaaaaaaaa"])],
			coversUpToId: "raw-1",
		}))).toBe(true);
		expect(isReflectionsReviewedEntry(reflectionsReviewedEntry("om-reviewed", { coversUpToId: "raw-1" }))).toBe(true);
		expect(isObservationsDroppedEntry(observationsDroppedEntry("om-drop-1", {
			observationIds: ["aaaaaaaaaaaa"],
			coversUpToId: "om-eeeeeeeeeeee",
		}))).toBe(true);
		expect(isObservationsFlaggedEntry(observationsFlaggedEntry("om-flag-1", {
			observationIds: ["aaaaaaaaaaaa"],
			reason: "Reflection omitted exact error path.",
		}))).toBe(true);
	});

	it("accepts flat folded memory details", () => {
		expect(isMemoryDetails(memoryDetails({
			fullFold: true,
			observations: [observation("aaaaaaaaaaaa")],
			reflections: [reflection("eeeeeeeeeeee", ["aaaaaaaaaaaa"])],
		}))).toBe(true);
	});

});
