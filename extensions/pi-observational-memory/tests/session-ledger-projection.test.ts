import { describe, expect, it } from "vitest";
import { buildNextCompactionProjection, contextProjection, fullProjection, nextContextProjection } from "../src/session-ledger/projection.js";
import { compactionEntry, memoryDetails, observation, observationsRecordedEntry, reflection, reflectionsRecordedEntry, reflectionsRewrittenEntry, rawMessage } from "./fixtures/session.js";

describe("session-ledger projections", () => {
	it("full projection folds typed observations and active reflections", () => {
		const obs = observation("aaaaaaaaaaaa");
		const ref = reflection("eeeeeeeeeeee", [obs.id]);
		const projection = fullProjection([
			rawMessage("raw-1", "source"),
			observationsRecordedEntry("om-obs", { observations: [obs], coversUpToId: "raw-1" }),
			reflectionsRecordedEntry("om-ref", { reflections: [ref], coversUpToId: "raw-1" }),
		]);

		expect(projection.observations.map((item) => item.id)).toEqual([obs.id]);
		expect(projection.reflections.map((item) => item.id)).toEqual([ref.id]);
	});

	it("context and next context render active reflections only", () => {
		const obs = observation("aaaaaaaaaaaa");
		const ref = reflection("eeeeeeeeeeee", [obs.id]);
		const entries = [
			rawMessage("raw-1", "source"),
			observationsRecordedEntry("om-obs", { observations: [obs], coversUpToId: "raw-1" }),
			reflectionsRecordedEntry("om-ref", { reflections: [ref], coversUpToId: "raw-1" }),
			compactionEntry("cmp", { details: memoryDetails({ observations: [obs], reflections: [ref] }) }),
		];

		expect(contextProjection(entries)).toEqual({ observations: [], reflections: [ref] });
		expect(nextContextProjection(entries, fullProjection(entries))).toEqual({ observations: [], reflections: [ref] });
	});

	it("rewrite events retire old reflections from active projection", () => {
		const oldRef = reflection("eeeeeeeeeeee");
		const newRef = reflection("ffffffffffff", [oldRef.id]);
		const entries = [
			rawMessage("raw-1", "source"),
			reflectionsRecordedEntry("om-old", { reflections: [oldRef], coversUpToId: "raw-1" }),
			reflectionsRecordedEntry("om-new", { reflections: [newRef], coversUpToId: "raw-1" }),
			reflectionsRewrittenEntry("om-rw", { retiredReflectionIds: [oldRef.id], summary: "merged" }),
		];

		expect(fullProjection(entries).reflections.map((ref) => ref.id)).toEqual([newRef.id]);
	});

	it("compaction projection stores reflections in details and hides observations from context", () => {
		const obs = observation("aaaaaaaaaaaa");
		const ref = reflection("eeeeeeeeeeee", [obs.id]);
		const projection = buildNextCompactionProjection([
			rawMessage("raw-1", "source"),
			observationsRecordedEntry("om-obs", { observations: [obs], coversUpToId: "raw-1" }),
			reflectionsRecordedEntry("om-ref", { reflections: [ref], coversUpToId: "raw-1" }),
		], "raw-1", { observationsPoolMaxTokens: 999 });

		expect(projection.observations).toEqual([]);
		expect(projection.reflections).toEqual([ref]);
		expect(projection.details.observations).toEqual([]);
		expect(projection.details.reflections).toEqual([ref]);
	});

	it("compaction projection can include only a bounded recent observed tail", () => {
		const oldObs = observation("aaaaaaaaaaaa");
		const tailA = observation("bbbbbbbbbbbb", { content: "Tail A" });
		const tailB = observation("cccccccccccc", { content: "Tail B" });
		const ref = reflection("eeeeeeeeeeee", [oldObs.id]);
		const projection = buildNextCompactionProjection([
			rawMessage("raw-1", "source"),
			observationsRecordedEntry("om-obs", { observations: [oldObs], coversUpToId: "raw-1" }),
			reflectionsRecordedEntry("om-ref", { reflections: [ref], coversUpToId: "raw-1" }),
		], "raw-1", { observationsPoolMaxTokens: 999, recentObservationTailMaxCount: 1 }, { recentObservedTail: [tailA, tailB] });

		expect(projection.observations).toEqual([tailA]);
		expect(projection.details.observations).toEqual([]);
		expect(projection.details.reflections).toEqual([ref]);
	});
});
