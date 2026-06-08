import { describe, expect, it } from "vitest";

import {
	normalizeDropObservationIds,
	runDropper,
	selectDropCandidates,
} from "../src/agents/dropper/agent.js";
import { fakeAgentLoop } from "./fixtures/agent-loop.js";
import { observation, reflection } from "./fixtures/session.js";

describe("dropper agent", () => {
	const obsA = observation("aaaaaaaaaaaa");
	const obsB = observation("bbbbbbbbbbbb");
	const obsC = observation("cccccccccccc");
	const baseArgs = {
		model: {},
		apiKey: "test",
		reflections: [reflection("eeeeeeeeeeee", ["aaaaaaaaaaaa"])],
		observations: [obsA, obsB, obsC],
		maxDropsAllowed: 20,
	};

	it("passes max drops as a hard upper bound", async () => {
		let userText = "";
		const loop = fakeAgentLoop((prompts) => {
			userText = prompts[0].content[0].text;
		});

		await runDropper({ ...baseArgs, agentLoop: loop });

		expect(userText).toContain("Eligible observations: 3 of 3 active");
		expect(userText).toContain("[coverage: partial]");
		expect(userText).toContain("[coverage: none]");
		expect(userText).toContain("Maximum drops allowed this run: 20 observations");
		expect(userText).toContain("hard safety cap, not a target");
		expect(userText).toContain("mark_no_drops if none are clearly safe");
	});

	it("normalizes active drop ids, filters invalid ids, and dedupes", () => {
		expect(normalizeDropObservationIds(["bbbbbbbbbbbb", "missing", "bbbbbbbbbbbb", "cccccccccccc", "aaaaaaaaaaaa"], [obsA, obsB, obsC])).toEqual(["bbbbbbbbbbbb", "cccccccccccc", "aaaaaaaaaaaa"]);
		expect(normalizeDropObservationIds(["missing", "cccccccccccc"], [obsA, obsB, obsC])).toEqual(["cccccccccccc"]);
		expect(normalizeDropObservationIds(["missing"], [obsA, obsB, obsC])).toBeUndefined();
	});

	it("selects final candidates by coverage, age, then stable ordering", () => {
		const first = observation("aaaaaaaaaaaa");
		const second = observation("bbbbbbbbbbbb");
		const third = observation("dddddddddddd");
		const observations = [first, second, third];
		const refs = [reflection("rrrrrrrrrrr1", ["bbbbbbbbbbbb"]), reflection("rrrrrrrrrrr2", ["dddddddddddd", "bbbbbbbbbbbb"] )];

		expect(selectDropCandidates(["aaaaaaaaaaaa", "dddddddddddd", "bbbbbbbbbbbb"], observations, 2, refs)).toEqual(["bbbbbbbbbbbb", "dddddddddddd"]);

		const oldObs = observation("999999999999", { timestamp: "2026-01-01T00:00:00.000Z" });
		const newObs = observation("888888888888", { timestamp: "2026-02-01T00:00:00.000Z" });
		expect(selectDropCandidates(["888888888888", "999999999999"], [oldObs, newObs], 1)).toEqual(["999999999999"]);
	});

	it("protects caller-supplied protected observations", () => {
		expect(selectDropCandidates(["aaaaaaaaaaaa", "bbbbbbbbbbbb"], [obsA, obsB], 2, [], ["aaaaaaaaaaaa"])).toEqual(["bbbbbbbbbbbb"]);
	});

	it("returns capped coverage-preferred proposed observation ids", async () => {
		const loop = fakeAgentLoop(async (_prompts, context) => {
			await context.tools[0].execute("tool-1", { ids: ["aaaaaaaaaaaa", "missing", "bbbbbbbbbbbb"] });
		});

		await expect(runDropper({ ...baseArgs, agentLoop: loop })).resolves.toEqual(["aaaaaaaaaaaa", "bbbbbbbbbbbb"]);
	});

	it("does not return protected proposed ids", async () => {
		const loop = fakeAgentLoop(async (_prompts, context) => {
			await context.tools[0].execute("tool-1", { ids: ["missing", "cccccccccccc"] });
		});

		await expect(runDropper({ ...baseArgs, agentLoop: loop, protectedObservationIds: ["cccccccccccc"] })).resolves.toBeUndefined();
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
