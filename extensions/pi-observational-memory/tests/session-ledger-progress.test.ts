import { describe, expect, it } from "vitest";

import {
	earlierCoverageMarkerId,
	entryIndexById,
	isSourceEntry,
	latestCoverageIndex,
	latestCoverageMarkerId,
	latestCuratorCursorIndex,
	latestCuratorCursorMarkerId,
	latestReflectionReviewIndex,
	latestReflectionReviewMarkerId,
	sourceEntryCountSinceReflectionReviewCoverage,
	sourceTokensAfterIndex,
	sourceTokensSinceDropCoverage,
	sourceTokensSinceObservationCoverage,
	sourceTokensSinceReflectionCoverage,
} from "../src/session-ledger/index.js";
import {
	OM_OBSERVATIONS_CURATED,
	OM_OBSERVATIONS_DROPPED,
	OM_OBSERVATIONS_RECORDED,
	OM_REFLECTIONS_RECORDED,
	branchSummary,
	compactionEntry,
	observation,
	observationsCuratedEntry,
	observationsDroppedEntry,
	observationsRecordedEntry,
	reflection,
	reflectionsRecordedEntry,
	reflectionsReviewedEntry,
	textCustomMessage,
} from "./fixtures/session.js";

describe("session-ledger progress helpers", () => {
	it("detects raw summaries and messages as source entries, but not memory ledger entries", () => {
		expect(isSourceEntry(textCustomMessage("raw-1", "abcd"))).toBe(true);
		expect(isSourceEntry(branchSummary("sum-1", "abcd"))).toBe(true);
		expect(isSourceEntry(observationsRecordedEntry("om-1", {
			observations: [observation("aaaaaaaaaaaa")],
			coversUpToId: "raw-1",
		}))).toBe(false);
		expect(isSourceEntry(compactionEntry("cmp-1"))).toBe(true);
	});

	it("builds a branch id to index map", () => {
		const entries = [textCustomMessage("raw-1", "abcd"), textCustomMessage("raw-2", "efgh")];
		expect(entryIndexById(entries).get("raw-1")).toBe(0);
		expect(entryIndexById(entries).get("raw-2")).toBe(1);
	});

	it("counts source tokens after a branch index and ignores memory ledger entries", () => {
		const entries = [
			textCustomMessage("raw-1", "aaaa"),
			observationsRecordedEntry("om-1", { observations: [observation("aaaaaaaaaaaa")], coversUpToId: "raw-1" }),
			textCustomMessage("raw-2", "bbbbbbbb"),
			compactionEntry("cmp-1", { firstKeptEntryId: "raw-2" }),
			branchSummary("sum-1", "cccccccccccc"),
		];

		expect(sourceTokensAfterIndex(entries, 0)).toBe(9); // raw-2: 2 + cmp-1: 4 + sum-1: 3
		expect(sourceTokensAfterIndex(entries, 1)).toBe(9);
		expect(sourceTokensAfterIndex(entries, 2)).toBe(7);
	});

	it("uses independent coverage clocks for observations, reflections, and drops", () => {
		const entries = [
			textCustomMessage("raw-1", "aaaa"),
			observationsRecordedEntry("om-aaaaaaaaaaaa", { observations: [observation("aaaaaaaaaaaa")], coversUpToId: "raw-1" }),
			textCustomMessage("raw-2", "bbbbbbbb"),
			reflectionsRecordedEntry("om-eeeeeeeeeeee", { reflections: [reflection("eeeeeeeeeeee", ["aaaaaaaaaaaa"])], coversUpToId: "raw-2" }),
			textCustomMessage("raw-3", "cccccccccccc"),
			observationsDroppedEntry("om-drop-1", { observationIds: ["aaaaaaaaaaaa"], coversUpToId: "om-eeeeeeeeeeee" }),
			textCustomMessage("raw-4", "dddddddddddddddd"),
		];

		expect(sourceTokensSinceObservationCoverage(entries)).toBe(9); // raw-2 + raw-3 + raw-4
		expect(sourceTokensSinceReflectionCoverage(entries)).toBe(7); // raw-3 + raw-4
		expect(sourceTokensSinceDropCoverage(entries)).toBe(7); // covers ledger entry om-eeeeeeeeeeee, raw after it
	});

	it("lets coversUpToId point to a memory ledger entry", () => {
		const entries = [
			textCustomMessage("raw-1", "aaaa"),
			reflectionsRecordedEntry("om-eeeeeeeeeeee", { reflections: [reflection("eeeeeeeeeeee", ["aaaaaaaaaaaa"])], coversUpToId: "raw-1" }),
			observationsDroppedEntry("om-drop-1", { observationIds: ["aaaaaaaaaaaa"], coversUpToId: "om-eeeeeeeeeeee" }),
			textCustomMessage("raw-2", "bbbbbbbb"),
		];

		expect(latestCoverageIndex(entries,OM_OBSERVATIONS_DROPPED)).toBe(1);
		expect(sourceTokensSinceDropCoverage(entries)).toBe(2);
	});

	it("chooses the max covered branch position, not merely latest ledger entry order", () => {
		const entries = [
			textCustomMessage("raw-1", "aaaa"),
			textCustomMessage("raw-2", "bbbbbbbb"),
			observationsRecordedEntry("om-aaaaaaaaaaaa", { observations: [observation("aaaaaaaaaaaa")], coversUpToId: "raw-2" }),
			observationsRecordedEntry("om-bbbbbbbbbbbb", { observations: [observation("bbbbbbbbbbbb")], coversUpToId: "raw-1" }),
			textCustomMessage("raw-3", "cccccccccccc"),
		];

		expect(latestCoverageIndex(entries,OM_OBSERVATIONS_RECORDED)).toBe(1);
		expect(latestCoverageMarkerId(entries,OM_OBSERVATIONS_RECORDED)).toBe("raw-2");
		expect(sourceTokensSinceObservationCoverage(entries)).toBe(3);
	});

	it("returns latest inner coverage marker and earlier marker by branch index", () => {
		const entries = [
			textCustomMessage("raw-1", "aaaa"),
			textCustomMessage("raw-2", "bbbbbbbb"),
			textCustomMessage("raw-3", "cccccccccccc"),
			observationsRecordedEntry("om-obs", { observations: [observation("aaaaaaaaaaaa")], coversUpToId: "raw-3" }),
			reflectionsRecordedEntry("om-ref", { reflections: [reflection("eeeeeeeeeeee", ["aaaaaaaaaaaa"])], coversUpToId: "raw-2" }),
		];

		expect(latestCoverageMarkerId(entries,OM_OBSERVATIONS_RECORDED)).toBe("raw-3");
		expect(latestCoverageMarkerId(entries,OM_REFLECTIONS_RECORDED)).toBe("raw-2");
		expect(earlierCoverageMarkerId(entries, "raw-3", "raw-2")).toBe("raw-2");
		expect(earlierCoverageMarkerId(entries, "raw-1", undefined)).toBe("raw-1");
		expect(earlierCoverageMarkerId(entries, "missing", "raw-2")).toBe("raw-2");
		expect(earlierCoverageMarkerId(entries, "missing-a", "missing-b")).toBeUndefined();
	});

	it("tracks curator cursor coverage independently", () => {
		const entries = [
			textCustomMessage("raw-1", "aaaa"),
			textCustomMessage("raw-2", "bbbbbbbb"),
			observationsCuratedEntry("om-curated-1", { coversUpToId: "raw-1" }),
			textCustomMessage("raw-3", "cccccccccccc"),
			observationsCuratedEntry("om-curated-2", { coversUpToId: "raw-3" }),
		];

		expect(latestCoverageIndex(entries, OM_OBSERVATIONS_CURATED)).toBe(3);
		expect(latestCuratorCursorIndex(entries)).toBe(3);
		expect(latestCuratorCursorMarkerId(entries)).toBe("raw-3");
	});

	it("uses recorded reflections and reviewed-zero markers for reflection review coverage", () => {
		const entries = [
			textCustomMessage("raw-1", "aaaa"),
			reflectionsRecordedEntry("om-ref", { reflections: [reflection("eeeeeeeeeeee", ["aaaaaaaaaaaa"])], coversUpToId: "raw-1" }),
			textCustomMessage("raw-2", "bbbbbbbb"),
			reflectionsReviewedEntry("om-reviewed", { coversUpToId: "raw-2" }),
			textCustomMessage("raw-3", "cccccccccccc"),
		];

		expect(latestReflectionReviewIndex(entries)).toBe(2);
		expect(latestReflectionReviewMarkerId(entries)).toBe("raw-2");
		expect(sourceEntryCountSinceReflectionReviewCoverage(entries)).toBe(1);
	});

});
