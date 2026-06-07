import { describe, expect, it } from "vitest";

import {
normalizeDropObservationIds,
	runDropper,
	selectDropCandidates,
} from "../src/agents/dropper/agent.js";
import { fakeAgentLoop } from "./fixtures/agent-loop.js";
import { observation, reflection } from "./fixtures/session.js";

describe("dropper agent", () => {
	const obsA = observation("aaaaaaaaaaaa", { relevance: "medium" });
	const obsB = observation("bbbbbbbbbbbb", { relevance: "low" });
	const critical = observation("cccccccccccc", { relevance: "critical" });
	const baseArgs = {
		model: {},
		apiKey: "test",
		reflections: [reflection("eeeeeeeeeeee", ["aaaaaaaaaaaa"])],
		observations: [obsA, obsB, critical],
		maxDropsAllowed: 20,
	};

	it("passes max drops as a hard upper bound", async () => {
		let userText = "";
		const loop = fakeAgentLoop((prompts) => {
			userText = prompts[0].content[0].text;
		});

		await runDropper({ ...baseArgs, agentLoop: loop });

		expect(userText).toContain("Active observations: 3");
		expect(userText).toContain("[coverage: partial]");
		expect(userText).toContain("[coverage: none]");
		expect(userText).toContain("Maximum drops allowed this run: 20 observations");
		expect(userText).toContain("hard safety cap, not a target");
		expect(userText).toContain("Drop fewer or none");
	});

	it("normalizes active drop ids, filters invalid ids, dedupes, and accepts critical observations", () => {
		expect(normalizeDropObservationIds(["bbbbbbbbbbbb", "missing", "bbbbbbbbbbbb", "cccccccccccc", "aaaaaaaaaaaa"], [obsA, obsB, critical])).toEqual(["bbbbbbbbbbbb", "cccccccccccc", "aaaaaaaaaaaa"]);
		expect(normalizeDropObservationIds(["missing", "cccccccccccc"], [obsA, obsB, critical])).toEqual(["cccccccccccc"]);
		expect(normalizeDropObservationIds(["missing"], [obsA, obsB, critical])).toBeUndefined();
	});

	it("selects final candidates by coverage, lower relevance, age, then stable ordering", () => {
		const highA = observation("aaaaaaaaaaaa", { relevance: "high" });
		const lowA = observation("bbbbbbbbbbbb", { relevance: "low" });
		const medium = observation("dddddddddddd", { relevance: "medium" });
		const lowB = observation("eeeeeeeeeeee", { relevance: "low" });
		const highB = observation("ffffffffffff", { relevance: "high" });
		const critical = observation("111111111111", { relevance: "critical" });
		const observations = [highA, lowA, medium, lowB, highB, critical];

		expect(selectDropCandidates([
			"aaaaaaaaaaaa",
			"missing",
			"111111111111",
			"bbbbbbbbbbbb",
			"dddddddddddd",
			"bbbbbbbbbbbb",
			"eeeeeeeeeeee",
			"ffffffffffff",
		], observations, 3)).toEqual(["bbbbbbbbbbbb", "eeeeeeeeeeee", "dddddddddddd"]);

		const oldHigh = observation("999999999999", { relevance: "high", timestamp: "2026-01-01T00:00:00.000Z" });
		const newHigh = observation("888888888888", { relevance: "high", timestamp: "2026-02-01T00:00:00.000Z" });
		expect(selectDropCandidates(["888888888888", "999999999999"], [oldHigh, newHigh], 1)).toEqual(["999999999999"]);
	});

	it("protects unreflected critical observations from dropping", () => {
		const critical = observation("aaaaaaaaaaaa", { relevance: "critical" });
		const low = observation("bbbbbbbbbbbb", { relevance: "low" });

		expect(selectDropCandidates(["aaaaaaaaaaaa", "bbbbbbbbbbbb"], [critical, low], 2)).toEqual(["bbbbbbbbbbbb"]);
	});

	it("prefers stronger reflection coverage before relevance when over cap", () => {
		const strongCritical = observation("aaaaaaaaaaaa", { relevance: "critical", timestamp: "2026-01-01T00:00:00.000Z" });
		const partialLow = observation("bbbbbbbbbbbb", { relevance: "low", timestamp: "2026-01-01T00:00:00.000Z" });
		const noneLow = observation("cccccccccccc", { relevance: "low", timestamp: "2026-01-01T00:00:00.000Z" });
		const observations = [strongCritical, partialLow, noneLow];
		const reflections = [
			reflection("rrrrrrrrrrr1", ["aaaaaaaaaaaa", "bbbbbbbbbbbb"]),
			reflection("rrrrrrrrrrr2", ["aaaaaaaaaaaa"]),
		];

		expect(selectDropCandidates(["cccccccccccc", "bbbbbbbbbbbb", "aaaaaaaaaaaa"], observations, 2, reflections)).toEqual(["aaaaaaaaaaaa", "bbbbbbbbbbbb"]);
	});

	it("keeps critical lower priority than lower relevance when coverage is equal", () => {
		const critical = observation("aaaaaaaaaaaa", { relevance: "critical", timestamp: "2026-01-01T00:00:00.000Z" });
		const high = observation("bbbbbbbbbbbb", { relevance: "high", timestamp: "2026-01-01T00:00:00.000Z" });
		const low = observation("cccccccccccc", { relevance: "low", timestamp: "2026-01-01T00:00:00.000Z" });
		const observations = [critical, high, low];
		const reflections = [reflection("rrrrrrrrrrr1", ["aaaaaaaaaaaa", "bbbbbbbbbbbb", "cccccccccccc"]), reflection("rrrrrrrrrrr2", ["aaaaaaaaaaaa", "bbbbbbbbbbbb", "cccccccccccc"])];

		expect(selectDropCandidates(["aaaaaaaaaaaa", "bbbbbbbbbbbb", "cccccccccccc"], observations, 2, reflections)).toEqual(["cccccccccccc", "bbbbbbbbbbbb"]);
	});

	it("returns capped coverage-preferred proposed observation ids", async () => {
		const loop = fakeAgentLoop(async (_prompts, context) => {
			await context.tools[0].execute("tool-1", { ids: ["aaaaaaaaaaaa", "missing", "bbbbbbbbbbbb"] });
		});

		await expect(runDropper({ ...baseArgs, agentLoop: loop })).resolves.toEqual(["aaaaaaaaaaaa", "bbbbbbbbbbbb"]);
	});

	it("does not return unreflected critical proposed ids", async () => {
		const loop = fakeAgentLoop(async (_prompts, context) => {
			await context.tools[0].execute("tool-1", { ids: ["missing", "cccccccccccc"] });
		});

		await expect(runDropper({ ...baseArgs, agentLoop: loop })).resolves.toBeUndefined();
	});

	it("returns undefined when only invalid ids are proposed", async () => {
		const loop = fakeAgentLoop(async (_prompts, context) => {
			await context.tools[0].execute("tool-1", { ids: ["missing"] });
		});

		await expect(runDropper({ ...baseArgs, agentLoop: loop })).resolves.toBeUndefined();
	});

	it("dedupes repeated tool calls and enforces one run-level cap", async () => {
		const loop = fakeAgentLoop(async (_prompts, context) => {
			await context.tools[0].execute("tool-1", { ids: ["aaaaaaaaaaaa"] });
			await context.tools[0].execute("tool-2", { ids: ["bbbbbbbbbbbb", "aaaaaaaaaaaa"] });
		});

		await expect(runDropper({ ...baseArgs, agentLoop: loop })).resolves.toEqual(["aaaaaaaaaaaa", "bbbbbbbbbbbb"]);
	});

	it("returns undefined when no tool call drops observations", async () => {
		const loop = fakeAgentLoop(() => {});
		await expect(runDropper({ ...baseArgs, agentLoop: loop })).resolves.toBeUndefined();
	});

});
