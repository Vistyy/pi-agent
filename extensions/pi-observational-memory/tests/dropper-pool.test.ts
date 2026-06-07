import { describe, expect, it } from "vitest";

import { derivedMaxDropCount, observationPoolMetrics } from "../src/agents/dropper/pool.js";
import { foldLedger, type Entry } from "../src/session-ledger/index.js";
import { observation, observationsDroppedEntry, observationsRecordedEntry, textCustomMessage } from "./fixtures/session.js";

describe("dropper active observation pool metrics", () => {
	it("reports below-limit pools as not ready", () => {
		const observations = [observation("aaaaaaaaaaaa", { relevance: "low", tokenCount: 20 })];

		expect(observationPoolMetrics(observations, 2)).toMatchObject({
			observationTokens: 20,
			activeObservationCount: 1,
			dropWhenActiveObservationsOver: 2,
			observationsOverTarget: 0,
			maxDropsAllowed: 0,
			overTarget: false,
			ready: false,
		});
	});

	it("reports at-limit pools as not ready", () => {
		const observations = [
			observation("aaaaaaaaaaaa", { relevance: "low", tokenCount: 50 }),
			observation("bbbbbbbbbbbb", { relevance: "medium", tokenCount: 50 }),
		];

		const metrics = observationPoolMetrics(observations, 2);

		expect(metrics.observationTokens).toBe(100);
		expect(metrics.activeObservationCount).toBe(2);
		expect(metrics.observationsOverTarget).toBe(0);
		expect(metrics.maxDropsAllowed).toBe(0);
		expect(metrics.overTarget).toBe(false);
		expect(metrics.ready).toBe(false);
	});

	it("reports above-limit pools as ready with derived drop cap", () => {
		const observations = [
			observation("aaaaaaaaaaaa", { relevance: "low", tokenCount: 50 }),
			observation("bbbbbbbbbbbb", { relevance: "medium", tokenCount: 50 }),
			observation("cccccccccccc", { relevance: "critical", tokenCount: 50 }),
		];

		const metrics = observationPoolMetrics(observations, 2);

		expect(metrics.observationTokens).toBe(150);
		expect(metrics.activeObservationCount).toBe(3);
		expect(metrics.observationsOverTarget).toBe(1);
		expect(metrics.maxDropsAllowed).toBe(1);
		expect(metrics.overTarget).toBe(true);
		expect(metrics.ready).toBe(true);
	});

	it("derives max drops as 10% with hard cap", () => {
		expect(derivedMaxDropCount(0)).toBe(0);
		expect(derivedMaxDropCount(1)).toBe(1);
		expect(derivedMaxDropCount(25)).toBe(3);
		expect(derivedMaxDropCount(200)).toBe(10);
	});

	it("uses folded active observations so tombstones reduce readiness", () => {
		const dropped = observation("aaaaaaaaaaaa", { relevance: "low", tokenCount: 100 });
		const active = observation("bbbbbbbbbbbb", { relevance: "low", tokenCount: 20 });
		const entries = [
			textCustomMessage("raw-1", "aaaaaaaa"),
			observationsRecordedEntry("om-obs", { observations: [dropped, active], coversUpToId: "raw-1" }),
			observationsDroppedEntry("om-drop", { observationIds: ["aaaaaaaaaaaa"], coversUpToId: "raw-1" }),
		];

		const folded = foldLedger(entries as Entry[]);
		const metrics = observationPoolMetrics(folded.activeObservations, 1);

		expect(folded.activeObservations.map((obs) => obs.id)).toEqual(["bbbbbbbbbbbb"]);
		expect(metrics.observationTokens).toBe(20);
		expect(metrics.overTarget).toBe(false);
		expect(metrics.ready).toBe(false);
	});
});
