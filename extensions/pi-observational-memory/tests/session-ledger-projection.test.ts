import { describe, expect, it } from "vitest";

import {
	buildNextCompactionProjection,
	classifyObservationsByReview,
	contextProjection,
	diffContextProjection,
	fullProjection,
	latestFullFoldBoundaryId,
	nextContextProjection,
} from "../src/session-ledger/index.js";
import {
	compactionEntry,
	memoryDetails,
	observation,
	observationsDroppedEntry,
	observationsRecordedEntry,
	reflection,
	reflectionsRecordedEntry,
	reflectionsReviewedEntry,
	reflectionsRewrittenEntry,
	textCustomMessage,
} from "./fixtures/session.js";

describe("session-ledger projections", () => {
	it("full projection folds typed observations, reflections, and drops", () => {
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

		expect(projection.observations.map((obs) => obs.id)).toEqual(["obs_bbbbbbbbbbbb"]);
		expect(projection.reflections.map((ref) => ref.id)).toEqual(["ref_eeeeeeeeeeee"]);
	});

	it("context projection is empty when there is no compaction", () => {
		const entries = [
			textCustomMessage("raw-1", "aaaa"),
			observationsRecordedEntry("om-aaaaaaaaaaaa", { observations: [observation("aaaaaaaaaaaa")], coversUpToId: "raw-1" }),
		];

		expect(contextProjection(entries)).toEqual({ observations: [], reflections: [] });
	});

	it("context projection uses active reflections from latest valid om.folded details", () => {
		const obs1 = observation("aaaaaaaaaaaa");
		const ref1 = reflection("eeeeeeeeeeee", ["aaaaaaaaaaaa"]);
		const entries = [
			textCustomMessage("raw-1", "aaaa"),
			compactionEntry("cmp-1", { firstKeptEntryId: "raw-1", details: memoryDetails({ observations: [obs1], reflections: [] }) }),
			compactionEntry("cmp-2", { firstKeptEntryId: "raw-1", details: memoryDetails({ fullFold: true, observations: [obs1], reflections: [ref1] }) }),
		];

		expect(contextProjection(entries)).toEqual({ observations: [], reflections: [ref1] });
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

	it("classifies observation review state for internal maintenance", () => {
		const reviewed = observation("aaaaaaaaaaaa", { sourceEntryIds: ["raw-1"] });
		const straddling = observation("bbbbbbbbbbbb", { sourceEntryIds: ["raw-1", "raw-2"] });
		const unknown = observation("cccccccccccc", { sourceEntryIds: ["missing"] });
		const entries = [
			textCustomMessage("raw-1", "aaaa"),
			textCustomMessage("raw-2", "bbbb"),
			reflectionsReviewedEntry("om-reviewed", { coversUpToId: "raw-1" }),
		];

		const result = classifyObservationsByReview(entries, [reviewed, straddling, unknown]);

		expect(result.reviewed.map((obs) => obs.id)).toEqual(["obs_aaaaaaaaaaaa"]);
		expect(result.unreviewed.map((obs) => obs.id)).toEqual(["obs_bbbbbbbbbbbb", "obs_cccccccccccc"]);
	});

	it("next context projection renders active reflections only", () => {
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

		expect(result.observations).toEqual([]);
		expect(result.reviewed.map((obs) => obs.id)).toEqual(["obs_aaaaaaaaaaaa"]);
		expect(result.unreviewed.map((obs) => obs.id)).toEqual(["obs_bbbbbbbbbbbb"]);
		expect(result.reflections.map((ref) => ref.id)).toEqual(["ref_eeeeeeeeeeee"]);
	});

	it("normal compaction summary projection contains reflections only and stores no observations in details", () => {
		const obs1 = observation("aaaaaaaaaaaa", { sourceEntryIds: ["raw-1"] });
		const ref1 = reflection("eeeeeeeeeeee", ["aaaaaaaaaaaa"]);
		const entries = [
			textCustomMessage("raw-1", "aaaa"),
			observationsRecordedEntry("om-observations", { observations: [obs1], coversUpToId: "raw-1" }),
			reflectionsRecordedEntry("om-reflection", { reflections: [ref1], coversUpToId: "raw-1" }),
		];

		const result = buildNextCompactionProjection(entries, "raw-1", { observationsPoolMaxTokens: 100 });

		expect(result.fullFold).toBe(false);
		expect(result.observations).toEqual([]);
		expect(result.reflections.map((ref) => ref.id)).toEqual(["ref_eeeeeeeeeeee"]);
		expect(result.details.observations).toEqual([]);
	});

	it("full compaction also renders active reflections only", () => {
		const obs1 = observation("aaaaaaaaaaaa");
		const ref1 = reflection("eeeeeeeeeeee", ["aaaaaaaaaaaa"]);
		const entries = [
			textCustomMessage("raw-1", "aaaa"),
			observationsRecordedEntry("om-aaaaaaaaaaaa", { observations: [obs1], coversUpToId: "raw-1" }),
			reflectionsRecordedEntry("om-eeeeeeeeeeee", { reflections: [ref1], coversUpToId: "raw-1" }),
		];

		const result = buildNextCompactionProjection(entries, "raw-1", { observationsPoolMaxTokens: 1 });

		expect(result.fullFold).toBe(true);
		expect(result.observations).toEqual([]);
		expect(result.reflections.map((ref) => ref.id)).toEqual(["ref_eeeeeeeeeeee"]);
		expect(result.details.observations).toEqual([]);
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

	it("rewrite events retire old reflections from active projection", () => {
		const ref1 = reflection("eeeeeeeeeeee", ["aaaaaaaaaaaa"]);
		const ref2 = reflection("ffffffffffff", ["aaaaaaaaaaaa"]);
		const entries = [
			textCustomMessage("raw-1", "aaaa"),
			reflectionsRecordedEntry("om-ref-1", { reflections: [ref1], coversUpToId: "raw-1" }),
			reflectionsRecordedEntry("om-ref-2", { reflections: [ref2], coversUpToId: "raw-1" }),
			reflectionsRewrittenEntry("om-rewrite", {
				retiredReflectionIds: ["eeeeeeeeeeee"],
				newReflectionIds: ["ffffffffffff"],
				retainedSourceIds: ["obs_aaaaaaaaaaaa"],
				discardedReflectionIds: ["eeeeeeeeeeee"],
				discardedSummary: "Retired stale duplicate.",
			}),
		];

		expect(fullProjection(entries).reflections.map((ref) => ref.id)).toEqual(["ref_ffffffffffff"]);
	});

	it("uses >= observationsPoolMaxTokens for compaction full-fold pressure only", () => {
		const obs1 = observation("aaaaaaaaaaaa");
		const entries = [
			textCustomMessage("raw-1", "aaaa"),
			observationsRecordedEntry("om-aaaaaaaaaaaa", { observations: [obs1], coversUpToId: "raw-1" }),
		];

		expect(buildNextCompactionProjection(entries, "raw-1", { observationsPoolMaxTokens: 1 }).fullFold).toBe(true);
	});

	it("reports context/next-context drift without treating observations as active memory", () => {
		const context = { observations: [], reflections: [] };
		const nextContext = { observations: [], reflections: [reflection("eeeeeeeeeeee", ["bbbbbbbbbbbb"])] };

		const diff = diffContextProjection(context, nextContext);

		expect(diff.observationsOnlyInNextContext).toEqual([]);
		expect(diff.observationsOnlyInContext).toEqual([]);
		expect(diff.reflectionsOnlyInNextContext.map((ref) => ref.id)).toEqual(["ref_eeeeeeeeeeee"]);
	});
});
