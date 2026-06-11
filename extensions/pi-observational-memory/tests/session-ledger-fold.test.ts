import { describe, expect, it } from "vitest";

import { foldLedger } from "../src/session-ledger/index.js";
import {
	branchSummary,
	observation,
	observationsDroppedEntry,
	observationsFlaggedEntry,
	observationsPinnedEntry,
	observationsRecordedEntry,
	observationsUnpinnedEntry,
	reflection,
	reflectionsRecordedEntry,
	reflectionsReviewedEntry,
	textCustomMessage,
} from "./fixtures/session.js";

describe("session-ledger folding", () => {
	it("folds observations and reflections from branch root through the target entry", () => {
		const obs1 = observation("aaaaaaaaaaaa", { sourceEntryIds: ["raw-1"] });
		const obs2 = observation("bbbbbbbbbbbb", { sourceEntryIds: ["raw-2"] });
		const ref1 = reflection("eeeeeeeeeeee", ["aaaaaaaaaaaa"]);
		const entries = [
			textCustomMessage("raw-1", "aaaa"),
			observationsRecordedEntry("om-aaaaaaaaaaaa", { observations: [obs1], coversUpToId: "raw-1" }),
			textCustomMessage("raw-2", "bbbb"),
			reflectionsRecordedEntry("om-eeeeeeeeeeee", { reflections: [ref1], coversUpToId: "raw-2" }),
			observationsRecordedEntry("om-bbbbbbbbbbbb", { observations: [obs2], coversUpToId: "raw-2" }),
		];

		const folded = foldLedger(entries, { upToEntryId: "om-eeeeeeeeeeee" });

		expect(folded.observations.map((obs) => obs.id)).toEqual(["aaaaaaaaaaaa"]);
		expect(folded.activeObservations.map((obs) => obs.id)).toEqual(["aaaaaaaaaaaa"]);
		expect(folded.reflections.map((ref) => ref.id)).toEqual(["eeeeeeeeeeee"]);
		expect(folded.observationsById.get("bbbbbbbbbbbb")).toBeUndefined();
	});

	it("applies drops as tombstones while preserving observation history", () => {
		const obs1 = observation("aaaaaaaaaaaa");
		const obs2 = observation("bbbbbbbbbbbb");
		const entries = [
			textCustomMessage("raw-1", "aaaa"),
			observationsRecordedEntry("om-aaaaaaaaaaaa", { observations: [obs1, obs2], coversUpToId: "raw-1" }),
			observationsDroppedEntry("om-drop-1", { observationIds: ["aaaaaaaaaaaa"], coversUpToId: "raw-1" }),
		];

		const folded = foldLedger(entries);

		expect(folded.observations.map((obs) => obs.id)).toEqual(["aaaaaaaaaaaa", "bbbbbbbbbbbb"]);
		expect(folded.activeObservations.map((obs) => obs.id)).toEqual(["bbbbbbbbbbbb"]);
		expect(folded.droppedObservationIds.has("aaaaaaaaaaaa")).toBe(true);
		expect(folded.observationsById.get("aaaaaaaaaaaa")).toEqual(obs1);
	});

	it("keeps first valid observation and reflection when duplicate ids appear", () => {
		const firstObs = observation("aaaaaaaaaaaa", { content: "first observation" });
		const duplicateObs = observation("aaaaaaaaaaaa", { content: "duplicate observation" });
		const firstRef = reflection("eeeeeeeeeeee", ["aaaaaaaaaaaa"], { content: "first reflection" });
		const duplicateRef = reflection("eeeeeeeeeeee", ["aaaaaaaaaaaa"], { content: "duplicate reflection" });
		const entries = [
			textCustomMessage("raw-1", "aaaa"),
			observationsRecordedEntry("om-aaaaaaaaaaaa", { observations: [firstObs], coversUpToId: "raw-1" }),
			observationsRecordedEntry("om-bbbbbbbbbbbb", { observations: [duplicateObs], coversUpToId: "raw-1" }),
			reflectionsRecordedEntry("om-eeeeeeeeeeee", { reflections: [firstRef], coversUpToId: "raw-1" }),
			reflectionsRecordedEntry("om-ffffffffffff", { reflections: [duplicateRef], coversUpToId: "raw-1" }),
		];

		const folded = foldLedger(entries);

		expect(folded.observationsById.get("aaaaaaaaaaaa")?.content).toBe("first observation");
		expect(folded.reflectionsById.get("eeeeeeeeeeee")?.content).toBe("first reflection");
		expect(folded.observations).toHaveLength(1);
		expect(folded.reflections).toHaveLength(1);
	});

	it("folds flagged observation ids for reflector follow-up", () => {
		const obs1 = observation("aaaaaaaaaaaa");
		const entries = [
			textCustomMessage("raw-1", "aaaa"),
			observationsRecordedEntry("om-aaaaaaaaaaaa", { observations: [obs1], coversUpToId: "raw-1" }),
			observationsFlaggedEntry("om-flag-1", { observationIds: ["aaaaaaaaaaaa", "deadbeef0000"], reason: "Reflection omitted exact detail." }),
		];

		const folded = foldLedger(entries);

		expect(folded.flaggedObservationIds.has("aaaaaaaaaaaa")).toBe(true);
		expect(folded.flaggedObservationIds.has("deadbeef0000")).toBe(true);
		expect(folded.flaggedObservationReasonsById.get("aaaaaaaaaaaa")).toEqual(["Reflection omitted exact detail."]);
		expect(folded.activeObservations.map((obs) => obs.id)).toEqual(["aaaaaaaaaaaa"]);
	});

	it("can fold only unresolved follow-up flags after a review cursor", () => {
		const obs1 = observation("aaaaaaaaaaaa");
		const obs2 = observation("bbbbbbbbbbbb");
		const entries = [
			textCustomMessage("raw-1", "aaaa"),
			observationsRecordedEntry("om-obs", { observations: [obs1, obs2], coversUpToId: "raw-1" }),
			observationsFlaggedEntry("om-flag-old", { observationIds: ["aaaaaaaaaaaa"], reason: "old follow-up" }),
			reflectionsReviewedEntry("om-reviewed", { coversUpToId: "raw-1" }),
			observationsFlaggedEntry("om-flag-new", { observationIds: ["bbbbbbbbbbbb"], reason: "new follow-up" }),
		];

		const folded = foldLedger(entries, { pendingFlagsAfterIndex: 3 });

		expect(folded.flaggedObservationIds.has("aaaaaaaaaaaa")).toBe(false);
		expect(folded.flaggedObservationIds.has("bbbbbbbbbbbb")).toBe(true);
		expect(folded.flaggedObservationReasonsById.get("bbbbbbbbbbbb")).toEqual(["new follow-up"]);
	});

	it("folds pinned and unpinned observation ids", () => {
		const obs1 = observation("aaaaaaaaaaaa");
		const obs2 = observation("bbbbbbbbbbbb");
		const entries = [
			textCustomMessage("raw-1", "aaaa"),
			observationsRecordedEntry("om-obs", { observations: [obs1, obs2], coversUpToId: "raw-1" }),
			observationsPinnedEntry("om-pin-1", { observationIds: ["aaaaaaaaaaaa", "bbbbbbbbbbbb"], reason: "Keep exact details visible." }),
			observationsUnpinnedEntry("om-unpin-1", { observationIds: ["aaaaaaaaaaaa"], reason: "Reflection now captures it." }),
		];

		const folded = foldLedger(entries);

		expect(folded.pinnedObservationIds.has("aaaaaaaaaaaa")).toBe(false);
		expect(folded.pinnedObservationIds.has("bbbbbbbbbbbb")).toBe(true);
		expect(folded.pinnedObservationReasonsById.get("bbbbbbbbbbbb")).toEqual(["Keep exact details visible."]);
	});

	it("drop wins over pin and flag", () => {
		const obs1 = observation("aaaaaaaaaaaa");
		const entries = [
			textCustomMessage("raw-1", "aaaa"),
			observationsRecordedEntry("om-obs", { observations: [obs1], coversUpToId: "raw-1" }),
			observationsPinnedEntry("om-pin-1", { observationIds: ["aaaaaaaaaaaa"], reason: "Keep exact details visible." }),
			observationsFlaggedEntry("om-flag-1", { observationIds: ["aaaaaaaaaaaa"], reason: "Needs follow-up." }),
			observationsDroppedEntry("om-drop-1", { observationIds: ["aaaaaaaaaaaa"], coversUpToId: "raw-1" }),
		];

		const folded = foldLedger(entries);

		expect(folded.activeObservations).toEqual([]);
		expect(folded.pinnedObservationIds.has("aaaaaaaaaaaa")).toBe(false);
		expect(folded.flaggedObservationIds.has("aaaaaaaaaaaa")).toBe(false);
	});

	it("normalizes and caps folded flag reasons", () => {
		const obs1 = observation("aaaaaaaaaaaa");
		const entries = [
			textCustomMessage("raw-1", "aaaa"),
			observationsRecordedEntry("om-aaaaaaaaaaaa", { observations: [obs1], coversUpToId: "raw-1" }),
			observationsFlaggedEntry("om-flag-1", { observationIds: ["aaaaaaaaaaaa"], reason: "first" }),
			observationsFlaggedEntry("om-flag-2", { observationIds: ["aaaaaaaaaaaa"], reason: "second" }),
			observationsFlaggedEntry("om-flag-3", { observationIds: ["aaaaaaaaaaaa"], reason: "third" }),
			observationsFlaggedEntry("om-flag-4", { observationIds: ["aaaaaaaaaaaa"], reason: ` ${"a".repeat(300)}\nmore` }),
		];

		const folded = foldLedger(entries);

		expect(folded.flaggedObservationReasonsById.get("aaaaaaaaaaaa")).toEqual(["second", "third", "a".repeat(240)]);
	});

	it("retains tombstones for unknown drop ids without throwing", () => {
		const entries = [
			textCustomMessage("raw-1", "aaaa"),
			observationsDroppedEntry("om-drop-1", { observationIds: ["deadbeef0000"], coversUpToId: "raw-1" }),
		];

		const folded = foldLedger(entries);

		expect(folded.droppedObservationIds.has("deadbeef0000")).toBe(true);
		expect(folded.activeObservations).toEqual([]);
	});

	it("folds only the branch path supplied by the caller", () => {
		const mainObs = observation("aaaa00000000", { sourceEntryIds: ["raw-main"] });
		const forkObs = observation("bbbb00000000", { sourceEntryIds: ["raw-fork"] });
		const mainBranch = [
			branchSummary("root", "root summary"),
			textCustomMessage("raw-main", "main"),
			observationsRecordedEntry("main-ledger", { observations: [mainObs], coversUpToId: "raw-main" }),
		];
		const forkBranch = [
			branchSummary("root", "root summary"),
			textCustomMessage("raw-fork", "fork"),
			observationsRecordedEntry("fork-ledger", { observations: [forkObs], coversUpToId: "raw-fork" }),
		];

		expect(foldLedger(mainBranch).observations.map((obs) => obs.id)).toEqual(["aaaa00000000"]);
		expect(foldLedger(forkBranch).observations.map((obs) => obs.id)).toEqual(["bbbb00000000"]);
	});
});
