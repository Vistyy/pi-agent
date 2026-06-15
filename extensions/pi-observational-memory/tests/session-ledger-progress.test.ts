import { describe, expect, it } from "vitest";
import {
	OM_OBSERVATIONS_RECORDED,
	OM_REFLECTIONS_RECORDED,
	entryIndexForId,
	latestCoverageIndex,
	latestCoverageMarkerId,
	latestReflectionReviewIndex,
	latestReflectionReviewMarkerId,
	sourceEntryCountSinceObservationCoverage,
	sourceEntryCountSinceReflectionReviewCoverage,
} from "../src/session-ledger/index.js";
import { observation, observationsRecordedEntry, reflection, reflectionsRecordedEntry, rawMessage } from "./fixtures/session.js";

describe("session-ledger progress helpers", () => {
	it("tracks observation and reflection coverage independently", () => {
		const entries = [
			rawMessage("raw-1", "a"),
			observationsRecordedEntry("om-obs", { observations: [observation("aaaaaaaaaaaa")], coversUpToId: "raw-1" }),
			rawMessage("raw-2", "b"),
			reflectionsRecordedEntry("om-ref", { reflections: [reflection("eeeeeeeeeeee")], coversUpToId: "raw-2" }),
			rawMessage("raw-3", "c"),
		];

		expect(latestCoverageIndex(entries, OM_OBSERVATIONS_RECORDED)).toBe(0);
		expect(latestCoverageMarkerId(entries, OM_REFLECTIONS_RECORDED)).toBe("raw-2");
		expect(sourceEntryCountSinceObservationCoverage(entries)).toBe(2);
		expect(sourceEntryCountSinceReflectionReviewCoverage(entries)).toBe(1);
	});

	it("uses recorded reflections as the reflection review cursor", () => {
		const entries = [
			rawMessage("raw-1", "a"),
			rawMessage("raw-2", "b"),
			reflectionsRecordedEntry("om-ref", { reflections: [], coversUpToId: "raw-2" }),
			rawMessage("raw-3", "c"),
		];

		expect(latestReflectionReviewIndex(entries)).toBe(1);
		expect(latestReflectionReviewMarkerId(entries)).toBe("raw-2");
		expect(sourceEntryCountSinceReflectionReviewCoverage(entries)).toBe(1);
	});

	it("returns -1 for missing entry ids", () => {
		expect(entryIndexForId([rawMessage("raw-1", "a")], "missing")).toBe(-1);
	});
});
