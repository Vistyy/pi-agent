import { describe, expect, it } from "vitest";

import {
	normalizeSupportingObservationIds,
	observationToMemoryAgentLine,
	runReflector,
	summarizeSupportIdCounts,
} from "../src/agents/reflector/agent.js";
import { hashId } from "../src/memory/ids.js";
import { fakeAgentLoop } from "./fixtures/agent-loop.js";
import { observation, reflection } from "./fixtures/session.js";

describe("reflector agent", () => {
	const obsA = observation("aaaaaaaaaaaa");
	const obsB = observation("bbbbbbbbbbbb");
	const baseArgs = {
		model: {},
		apiKey: "test",
		reflections: [],
		observations: [obsA, obsB],
	};

	it("renders coverage tiers in every active observation line for the reflector", async () => {
		const none = observation("aaaaaaaaaaaa", { content: "Uncovered durable fact" });
		const partial = observation("bbbbbbbbbbbb", { content: "Partially covered fact" });
		const strong = observation("cccccccccccc", { content: "Strongly covered fact" });
		let userText = "";
		const loop = fakeAgentLoop((prompts) => {
			userText = prompts[0].content[0].text;
		});

		await runReflector({
			...baseArgs,
			observations: [none, partial, strong],
			reflections: [
				reflection("rrrrrrrrrrr1", ["bbbbbbbbbbbb", "cccccccccccc"]),
				reflection("rrrrrrrrrrr2", ["cccccccccccc"]),
			],
			agentLoop: loop,
		});

		expect(userText).toContain("[aaaaaaaaaaaa]");
		expect(userText).toContain("[coverage: none] Uncovered durable fact");
		expect(userText).toContain("[coverage: partial] Partially covered fact");
		expect(userText).toContain("[coverage: strong] Strongly covered fact");
	});

	it("renders flagged follow-up observations with reasons", async () => {
		let userText = "";
		const loop = fakeAgentLoop((prompts) => {
			userText = prompts[0].content[0].text;
		});

		await runReflector({
			...baseArgs,
			flaggedObservations: [{ observation: obsB, reasons: ["Reflection omitted exact error path."] }],
			agentLoop: loop,
		});

		expect(userText).toContain("FLAGGED FOR FOLLOW-UP");
		expect(userText).toContain("[bbbbbbbbbbbb]");
		expect(userText).toContain("[bbbbbbbbbbbb] — Reflection omitted exact error path.");
		expect(userText).toContain("Their full text is in CURRENT OBSERVATIONS.");
		expect(userText).toContain("This does not modify existing reflections.");
		expect(userText).toContain("Use the reasons as context, not as fixed categories.");
	});

	it("omits flagged follow-up section when there are no flagged observations", async () => {
		let userText = "";
		const loop = fakeAgentLoop((prompts) => {
			userText = prompts[0].content[0].text;
		});

		await runReflector({ ...baseArgs, flaggedObservations: [], agentLoop: loop });

		expect(userText).not.toContain("FLAGGED FOR FOLLOW-UP");
	});

	it("renders reflector observation lines with coverage evidence only", () => {
		const line = observationToMemoryAgentLine(
			observation("aaaaaaaaaaaa", { content: "Important reflected fact" }),
			"partial",
		);

		expect(line).toContain("[aaaaaaaaaaaa]");
		expect(line).toContain("[coverage: partial]");
		expect(line).toContain("Important reflected fact");
	});

	it("summarizes accepted reflection support-id counts without exposing ids", () => {
		expect(summarizeSupportIdCounts([])).toEqual({
			reflectionCount: 0,
			totalSupportIds: 0,
			minSupportIds: 0,
			maxSupportIds: 0,
			averageSupportIds: 0,
			histogram: {},
		});
		expect(summarizeSupportIdCounts([
			reflection("rrrrrrrrrrr1", ["aaaaaaaaaaaa"]),
			reflection("rrrrrrrrrrr2", ["aaaaaaaaaaaa", "bbbbbbbbbbbb", "cccccccccccc"]),
		])).toEqual({
			reflectionCount: 2,
			totalSupportIds: 4,
			minSupportIds: 1,
			maxSupportIds: 3,
			averageSupportIds: 2,
			histogram: { "1": 1, "3": 1 },
		});
	});

	it("normalizes supporting observation ids by active observation order", () => {
		expect(normalizeSupportingObservationIds(["bbbbbbbbbbbb", "aaaaaaaaaaaa", "aaaaaaaaaaaa"], ["aaaaaaaaaaaa", "bbbbbbbbbbbb"])).toEqual(["aaaaaaaaaaaa", "bbbbbbbbbbbb"]);
		expect(normalizeSupportingObservationIds(["aaaaaaaaaaaa", "missing"], ["aaaaaaaaaaaa"])).toBeUndefined();
		expect(normalizeSupportingObservationIds([], ["aaaaaaaaaaaa"])).toBeUndefined();
	});

	it("records one-line reflections with code-computed ids", async () => {
		const content = "User prefers source-backed memory.";
		const loop = fakeAgentLoop(async (_prompts, context) => {
			await context.tools[0].execute("tool-1", {
				reflections: [{ content, supportingObservationIds: ["bbbbbbbbbbbb", "aaaaaaaaaaaa"] }],
			});
		});

		const result = await runReflector({ ...baseArgs, agentLoop: loop });

		expect(result).toEqual([{ id: hashId(content), content, supportingObservationIds: ["aaaaaaaaaaaa", "bbbbbbbbbbbb"] }]);
	});

	it("rejects invented support ids and multiline content", async () => {
		const loop = fakeAgentLoop(async (_prompts, context) => {
			await context.tools[0].execute("tool-1", {
				reflections: [
					{ content: "Bad support", supportingObservationIds: ["missing"] },
					{ content: "Two\nlines", supportingObservationIds: ["aaaaaaaaaaaa"] },
				],
			});
		});

		await expect(runReflector({ ...baseArgs, agentLoop: loop })).resolves.toBeUndefined();
	});

	it("dedupes proposals and skips existing reflection ids", async () => {
		const content = "User prefers terse updates.";
		const existing = reflection(hashId(content), ["aaaaaaaaaaaa"], { content });
		const loop = fakeAgentLoop(async (_prompts, context) => {
			await context.tools[0].execute("tool-1", {
				reflections: [
					{ content, supportingObservationIds: ["aaaaaaaaaaaa"] },
					{ content: "New durable fact.", supportingObservationIds: ["aaaaaaaaaaaa"] },
					{ content: "New durable fact.", supportingObservationIds: ["bbbbbbbbbbbb"] },
				],
			});
		});

		const result = await runReflector({ ...baseArgs, reflections: [existing], agentLoop: loop });

		expect(result?.map((item) => item.content)).toEqual(["New durable fact."]);
	});

	it("returns empty array when explicitly marked reviewed with no reflections", async () => {
		const loop = fakeAgentLoop(async (_prompts, context) => {
			expect(context.tools.map((tool) => tool.name)).toEqual(["record_reflections", "mark_reviewed_no_reflections"]);
			await context.tools[1].execute("tool-1", {});
		});
		await expect(runReflector({ ...baseArgs, agentLoop: loop })).resolves.toEqual([]);
	});

	it("returns undefined when no tool call records reflections", async () => {
		const loop = fakeAgentLoop(() => {});
		await expect(runReflector({ ...baseArgs, agentLoop: loop })).resolves.toBeUndefined();
	});
});
