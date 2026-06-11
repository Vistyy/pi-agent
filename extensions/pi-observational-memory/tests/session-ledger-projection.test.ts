import { describe, expect, it } from "vitest";

import {
	buildNextCompactionProjection,
	classifyObservationsByReview,
	diffContextProjection,
	fullProjection,
	latestFullFoldBoundaryId,
	contextProjection,
	nextContextProjection,
} from "../src/session-ledger/index.js";
import {
	compactionEntry,
	memoryDetails,
	observation,
	observationsDroppedEntry,
	observationsPinnedEntry,
	observationsRecordedEntry,
	reflection,
	reflectionsRecordedEntry,
	reflectionsReviewedEntry,
	textCustomMessage,
} from "./fixtures/session.js";

describe("session-ledger projections", () => {
	it("full projection folds observations, reflections, and drops through the target", () => {
		const obs1 = observation("aaaaaaaaaaaa");
		const obs2 = observation("bbbbbbbbbbbb");
		const ref1 = reflection("eeeeeeeeeeee", ["aaaaaaaaaaaa"]);
		const entries = [
			textCustomMessage("raw-1", "aaaa"),
			observationsRecordedEntry("om-aaaaaaaaaaaa", { observations: [obs1, obs2], coversUpToId: "raw-1" }),
			reflectionsRecordedEntry("om-eeeeeeeeeeee", { reflections: [ref1], coversUpToId: "raw-1" }),
			observationsDroppedEntry("om-drop-1", { observationIds: ["aaaaaaaaaaaa"], coversUpToId: "om-eeeeeeeeeeee" }),
		];

		const projection = fullProjection(entries);

		expect(projection.observations.map((obs) => obs.id)).toEqual(["bbbbbbbbbbbb"]);
		expect(projection.reflections.map((ref) => ref.id)).toEqual(["eeeeeeeeeeee"]);
	});

	it("context projection is empty when there is no compaction", () => {
		const entries = [
			textCustomMessage("raw-1", "aaaa"),
			observationsRecordedEntry("om-aaaaaaaaaaaa", { observations: [observation("aaaaaaaaaaaa")], coversUpToId: "raw-1" }),
		];

		expect(contextProjection(entries)).toEqual({ observations: [], reflections: [] });
	});

	it("context projection uses the latest valid om.folded compaction details", () => {
		const obs1 = observation("aaaaaaaaaaaa");
		const ref1 = reflection("eeeeeeeeeeee", ["aaaaaaaaaaaa"]);
		const obs2 = observation("bbbbbbbbbbbb");
		const entries = [
			textCustomMessage("raw-1", "aaaa"),
			compactionEntry("cmp-1", { firstKeptEntryId: "raw-1", details: memoryDetails({ observations: [obs1], reflections: [] }) }),
			textCustomMessage("raw-2", "bbbb"),
			compactionEntry("cmp-2", { firstKeptEntryId: "raw-2", details: memoryDetails({ fullFold: true, observations: [obs2], reflections: [ref1] }) }),
		];

		expect(contextProjection(entries)).toEqual({ observations: [obs2], reflections: [ref1] });
	});

	it("finds the latest full-fold boundary", () => {
		const entries = [
			textCustomMessage("raw-1", "aaaa"),
			compactionEntry("cmp-1", { firstKeptEntryId: "raw-1", details: memoryDetails({ fullFold: true }) }),
			textCustomMessage("raw-2", "bbbb"),
			compactionEntry("cmp-2", { firstKeptEntryId: "raw-2", details: memoryDetails({ fullFold: false }) }),
			textCustomMessage("raw-3", "cccc"),
			compactionEntry("cmp-3", { firstKeptEntryId: "raw-3", details: memoryDetails({ fullFold: true }) }),
		];

		expect(latestFullFoldBoundaryId(entries)).toBe("raw-3");
	});

	it("first normal compaction includes observations and reflections by coverage but excludes maintenance drops", () => {
		const obs1 = observation("aaaaaaaaaaaa", { sourceEntryIds: ["raw-2"] });
		const ref1 = reflection("eeeeeeeeeeee", ["aaaaaaaaaaaa"]);
		const entries = [
			textCustomMessage("raw-1", "aaaa"),
			textCustomMessage("raw-2", "bbbb"),
			observationsRecordedEntry("om-aaaaaaaaaaaa", { observations: [obs1], coversUpToId: "raw-2" }),
			reflectionsRecordedEntry("om-eeeeeeeeeeee", { reflections: [ref1], coversUpToId: "raw-2" }),
			observationsDroppedEntry("om-drop-1", { observationIds: ["aaaaaaaaaaaa"], coversUpToId: "raw-2" }),
		];

		const result = buildNextCompactionProjection(entries, "raw-2", { observationsPoolMaxTokens: 100 });

		expect(result.fullFold).toBe(false);
		expect(result.observations.map((obs) => obs.id)).toEqual([]);
		expect(result.reflections.map((ref) => ref.id)).toEqual(["eeeeeeeeeeee"]);
		expect(result.details).toMatchObject({ type: "om.folded", fullFold: false });
	});

	it("normal compaction projection includes transient observations appended after compaction preparation", () => {
		const obs1 = observation("aaaaaaaaaaaa", {
			content: "Canonical approved feature flag: fast_sync_v2_enabled supersedes enableFastSync",
			sourceEntryIds: ["raw-1"],		});
		const entries = [
			textCustomMessage("raw-1", "canonical source before kept boundary"),
			textCustomMessage("raw-2", "first kept entry"),
		];

		const result = buildNextCompactionProjection(
			entries,
			"raw-2",
			{ observationsPoolMaxTokens: 100 },
			{ observations: [obs1], reflections: [] },
		);

		expect(result.fullFold).toBe(false);
		expect(result.observations.map((obs) => obs.id)).toEqual(["aaaaaaaaaaaa"]);
		expect(result.details.observations.map((obs) => obs.id)).toEqual(["aaaaaaaaaaaa"]);
	});

	it("classifies observations as reviewed only when all source entries are behind the reflection review cursor", () => {
		const reviewed = observation("aaaaaaaaaaaa", { sourceEntryIds: ["raw-1"] });
		const straddling = observation("bbbbbbbbbbbb", { sourceEntryIds: ["raw-1", "raw-2"] });
		const unknown = observation("cccccccccccc", { sourceEntryIds: ["missing"] });
		const entries = [
			textCustomMessage("raw-1", "aaaa"),
			textCustomMessage("raw-2", "bbbb"),
			reflectionsReviewedEntry("om-reviewed", { coversUpToId: "raw-1" }),
		];

		const result = classifyObservationsByReview(entries, [reviewed, straddling, unknown]);

		expect(result.reviewed.map((obs) => obs.id)).toEqual(["aaaaaaaaaaaa"]);
		expect(result.unreviewed.map((obs) => obs.id)).toEqual(["bbbbbbbbbbbb", "cccccccccccc"]);
	});

	it("next context projection shows unreviewed observations and hides reviewed observations", () => {
		const reviewed = observation("aaaaaaaaaaaa", { sourceEntryIds: ["raw-1"] });
		const pending = observation("bbbbbbbbbbbb", { sourceEntryIds: ["raw-2"] });
		const ref1 = reflection("eeeeeeeeeeee", ["aaaaaaaaaaaa"]);
		const entries = [
			textCustomMessage("raw-1", "aaaa"),
			textCustomMessage("raw-2", "bbbb"),
			observationsRecordedEntry("om-observations", { observations: [reviewed, pending], coversUpToId: "raw-2" }),
			reflectionsRecordedEntry("om-reflection", { reflections: [ref1], coversUpToId: "raw-1" }),
		];

		const result = nextContextProjection(entries, fullProjection(entries));

		expect(result.observations.map((obs) => obs.id)).toEqual(["bbbbbbbbbbbb"]);
		expect(result.reviewed.map((obs) => obs.id)).toEqual(["aaaaaaaaaaaa"]);
		expect(result.unreviewed.map((obs) => obs.id)).toEqual(["bbbbbbbbbbbb"]);
		expect(result.reflections.map((ref) => ref.id)).toEqual(["eeeeeeeeeeee"]);
	});

	it("next context projection includes pinned reviewed observations", () => {
		const reviewed = observation("aaaaaaaaaaaa", { sourceEntryIds: ["raw-1"] });
		const pending = observation("bbbbbbbbbbbb", { sourceEntryIds: ["raw-2"] });
		const entries = [
			textCustomMessage("raw-1", "aaaa"),
			textCustomMessage("raw-2", "bbbb"),
			observationsRecordedEntry("om-observations", { observations: [reviewed, pending], coversUpToId: "raw-2" }),
			reflectionsReviewedEntry("om-reviewed", { coversUpToId: "raw-1" }),
			observationsPinnedEntry("om-pin", { observationIds: ["aaaaaaaaaaaa"], reason: "Keep exact path visible." }),
		];

		const result = nextContextProjection(entries, fullProjection(entries));

		expect(result.observations.map((obs) => obs.id)).toEqual(["bbbbbbbbbbbb", "aaaaaaaaaaaa"]);
		expect(result.reviewed.map((obs) => obs.id)).toEqual(["aaaaaaaaaaaa"]);
		expect(result.unreviewed.map((obs) => obs.id)).toEqual(["bbbbbbbbbbbb"]);
	});

	it("normal compaction projection hides reviewed observations but keeps reflections", () => {
		const reviewed = observation("aaaaaaaaaaaa", { sourceEntryIds: ["raw-1"] });
		const pending = observation("bbbbbbbbbbbb", { sourceEntryIds: ["raw-2"] });
		const ref1 = reflection("eeeeeeeeeeee", ["aaaaaaaaaaaa"]);
		const entries = [
			textCustomMessage("raw-1", "aaaa"),
			textCustomMessage("raw-2", "bbbb"),
			observationsRecordedEntry("om-observations", { observations: [reviewed, pending], coversUpToId: "raw-2" }),
			reflectionsRecordedEntry("om-reflection", { reflections: [ref1], coversUpToId: "raw-1" }),
		];

		const result = buildNextCompactionProjection(entries, "raw-2", { observationsPoolMaxTokens: 100 });

		expect(result.fullFold).toBe(false);
		expect(result.observations.map((obs) => obs.id)).toEqual(["bbbbbbbbbbbb"]);
		expect(result.reflections.map((ref) => ref.id)).toEqual(["eeeeeeeeeeee"]);
		expect(result.details.observations.map((obs) => obs.id)).toEqual(["aaaaaaaaaaaa", "bbbbbbbbbbbb"]);
	});

	it("normal compaction projection includes current observations and reflections but keeps drops at latest full-fold boundary", () => {
		const obs1 = observation("aaaaaaaaaaaa");
		const obs2 = observation("bbbbbbbbbbbb");
		const ref1 = reflection("eeeeeeeeeeee", ["aaaaaaaaaaaa"]);
		const ref2 = reflection("ffffffffffff", ["bbbbbbbbbbbb"]);
		const entries = [
			textCustomMessage("raw-1", "aaaa"),
			observationsRecordedEntry("om-aaaaaaaaaaaa", { observations: [obs1], coversUpToId: "raw-1" }),
			reflectionsRecordedEntry("om-eeeeeeeeeeee", { reflections: [ref1], coversUpToId: "raw-1" }),
			compactionEntry("cmp-full", { firstKeptEntryId: "raw-1", details: memoryDetails({ fullFold: true, observations: [obs1], reflections: [ref1] }) }),
			textCustomMessage("raw-2", "bbbb"),
			observationsRecordedEntry("om-bbbbbbbbbbbb", { observations: [obs2], coversUpToId: "raw-2" }),
			reflectionsRecordedEntry("om-ffffffffffff", { reflections: [ref2], coversUpToId: "raw-2" }),
			observationsDroppedEntry("om-drop-2", { observationIds: ["aaaaaaaaaaaa"], coversUpToId: "raw-2" }),
		];

		const result = buildNextCompactionProjection(entries, "raw-2", { observationsPoolMaxTokens: 100 });

		expect(result.fullFold).toBe(false);
		expect(result.observations.map((obs) => obs.id)).toEqual([]);
		expect(result.reflections.map((ref) => ref.id)).toEqual(["eeeeeeeeeeee", "ffffffffffff"]);
		expect(result.details).toMatchObject({ type: "om.folded", fullFold: false });
	});

	it("full compaction projection applies reflections and drops through current boundary by coverage", () => {
		const obs1 = observation("aaaaaaaaaaaa");
		const obs2 = observation("bbbbbbbbbbbb");
		const ref1 = reflection("eeeeeeeeeeee", ["aaaaaaaaaaaa"]);
		const ref2 = reflection("ffffffffffff", ["bbbbbbbbbbbb"]);
		const entries = [
			textCustomMessage("raw-1", "aaaa"),
			observationsRecordedEntry("om-aaaaaaaaaaaa", { observations: [obs1], coversUpToId: "raw-1" }),
			reflectionsRecordedEntry("om-eeeeeeeeeeee", { reflections: [ref1], coversUpToId: "raw-1" }),
			compactionEntry("cmp-full", { firstKeptEntryId: "raw-1", details: memoryDetails({ fullFold: true, observations: [obs1], reflections: [ref1] }) }),
			textCustomMessage("raw-2", "bbbb"),
			observationsRecordedEntry("om-bbbbbbbbbbbb", { observations: [obs2], coversUpToId: "raw-2" }),
			reflectionsRecordedEntry("om-ffffffffffff", { reflections: [ref2], coversUpToId: "raw-2" }),
			observationsDroppedEntry("om-drop-2", { observationIds: ["aaaaaaaaaaaa"], coversUpToId: "raw-2" }),
		];

		const result = buildNextCompactionProjection(entries, "raw-2", { observationsPoolMaxTokens: 10 });

		expect(result.fullFold).toBe(true);
		expect(result.observations.map((obs) => obs.id)).toEqual([]);
		expect(result.reflections.map((ref) => ref.id)).toEqual(["eeeeeeeeeeee", "ffffffffffff"]);
		expect(result.details).toMatchObject({ type: "om.folded", fullFold: true });
	});

	it("ignores dangling coversUpToId markers during projection", () => {
		const obs1 = observation("aaaaaaaaaaaa");
		const ref1 = reflection("eeeeeeeeeeee", ["aaaaaaaaaaaa"]);
		const entries = [
			textCustomMessage("raw-1", "aaaa"),
			observationsRecordedEntry("om-aaaaaaaaaaaa", { observations: [obs1], coversUpToId: "missing" }),
			reflectionsRecordedEntry("om-eeeeeeeeeeee", { reflections: [ref1], coversUpToId: "missing" }),
			observationsDroppedEntry("om-drop-1", { observationIds: ["aaaaaaaaaaaa"], coversUpToId: "missing" }),
		];

		expect(() => fullProjection(entries, "raw-1")).not.toThrow();
		expect(fullProjection(entries, "raw-1")).toEqual({ observations: [], reflections: [] });
	});

	it("keeps the first covered observation and reflection for duplicate ids", () => {
		const firstObs = observation("aaaaaaaaaaaa", { content: "first observation" });
		const secondObs = observation("aaaaaaaaaaaa", { content: "second observation" });
		const firstRef = reflection("eeeeeeeeeeee", ["aaaaaaaaaaaa"], { content: "first reflection" });
		const secondRef = reflection("eeeeeeeeeeee", ["aaaaaaaaaaaa"], { content: "second reflection" });
		const entries = [
			textCustomMessage("raw-1", "aaaa"),
			observationsRecordedEntry("om-obs-1", { observations: [firstObs], coversUpToId: "raw-1" }),
			observationsRecordedEntry("om-obs-2", { observations: [secondObs], coversUpToId: "raw-1" }),
			reflectionsRecordedEntry("om-ref-1", { reflections: [firstRef], coversUpToId: "raw-1" }),
			reflectionsRecordedEntry("om-ref-2", { reflections: [secondRef], coversUpToId: "raw-1" }),
		];

		const projection = fullProjection(entries, "raw-1");

		expect(projection.observations).toEqual([firstObs]);
		expect(projection.reflections).toEqual([firstRef]);
	});

	it("uses >= observationsPoolMaxTokens for full-fold pressure", () => {
		const obs1 = observation("aaaaaaaaaaaa");
		const entries = [
			textCustomMessage("raw-1", "aaaa"),
			observationsRecordedEntry("om-aaaaaaaaaaaa", { observations: [obs1], coversUpToId: "raw-1" }),
		];

		expect(buildNextCompactionProjection(entries, "raw-1", { observationsPoolMaxTokens: 1 }).fullFold).toBe(true);
	});

	it("reports context/next-context drift", () => {
		const context = { observations: [observation("aaaaaaaaaaaa")], reflections: [] };
		const nextContext = {
			observations: [observation("aaaaaaaaaaaa"), observation("bbbbbbbbbbbb")],
			reflections: [reflection("eeeeeeeeeeee", ["bbbbbbbbbbbb"])],
		};

		const diff = diffContextProjection(context, nextContext);

		expect(diff.observationsOnlyInNextContext.map((obs) => obs.id)).toEqual(["bbbbbbbbbbbb"]);
		expect(diff.reflectionsOnlyInNextContext.map((ref) => ref.id)).toEqual(["eeeeeeeeeeee"]);
	});
});
