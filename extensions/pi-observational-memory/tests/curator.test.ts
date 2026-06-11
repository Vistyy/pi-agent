import { describe, expect, it } from "vitest";

import { runCurator } from "../src/agents/curator/agent.js";
import { observation, reflection } from "./fixtures/session.js";
import { fakeAgentLoop } from "./fixtures/agent-loop.js";

const obsA = observation("aaaaaaaaaaaa", { content: "Exact failing path: /tmp/project/src/foo.ts" });
const obsB = observation("bbbbbbbbbbbb", { content: "Transient noisy debug log" });
const obsC = observation("cccccccccccc", { content: "Current user constraint: use pnpm" });
const refA = reflection("eeeeeeeeeeee", ["aaaaaaaaaaaa"], { content: "There is a failing path." });

const baseArgs = {
	model: { provider: "test", id: "curator" } as never,
	apiKey: "test-key",
	reflections: [refA],
	observations: [obsA, obsB, obsC],
	maxDropsAllowed: 2,
	maxTurns: 3,
};

describe("curator agent", () => {
	it("pins valid ids and rejects invalid ids within the same tool call", async () => {
		const loop = fakeAgentLoop(async (_prompts, context) => {
			const tool = context.tools.find((candidate: any) => candidate.name === "pin_observations")!;
			await tool.execute("tool-1", { ids: ["aaaaaaaaaaaa", "missing", "aaaaaaaaaaaa"], reason: " Keep exact path visible.\nMore " });
		});

		const result = await runCurator({ ...baseArgs, agentLoop: loop });

		expect(result?.pinned).toEqual([{ observationIds: ["aaaaaaaaaaaa"], reason: "Keep exact path visible. More" }]);
		expect(result?.unpinned).toEqual([]);
		expect(result?.flagged).toEqual([]);
		expect(result?.dropped).toEqual([]);
	});

	it("only unpins observations that are currently pinned", async () => {
		const loop = fakeAgentLoop(async (_prompts, context) => {
			const tool = context.tools.find((candidate: any) => candidate.name === "unpin_observations")!;
			await tool.execute("tool-1", { ids: ["aaaaaaaaaaaa", "bbbbbbbbbbbb"], reason: "Reflection now captures it." });
		});

		const result = await runCurator({ ...baseArgs, pinnedObservationIds: ["aaaaaaaaaaaa"], agentLoop: loop });

		expect(result?.unpinned).toEqual([{ observationIds: ["aaaaaaaaaaaa"], reason: "Reflection now captures it." }]);
	});

	it("flags valid ids with a normalized follow-up reason", async () => {
		const loop = fakeAgentLoop(async (_prompts, context) => {
			const tool = context.tools.find((candidate: any) => candidate.name === "flag_observations")!;
			await tool.execute("tool-1", { ids: ["aaaaaaaaaaaa", "missing"], reason: "Reflection omitted /tmp/project/src/foo.ts" });
		});

		const result = await runCurator({ ...baseArgs, agentLoop: loop });

		expect(result?.flagged).toEqual([{ observationIds: ["aaaaaaaaaaaa"], reason: "Reflection omitted /tmp/project/src/foo.ts" }]);
	});

	it("drops valid candidates while respecting protected ids and max drop cap", async () => {
		const loop = fakeAgentLoop(async (_prompts, context) => {
			const tool = context.tools.find((candidate: any) => candidate.name === "drop_observations")!;
			await tool.execute("tool-1", { ids: ["aaaaaaaaaaaa", "bbbbbbbbbbbb", "cccccccccccc", "missing"], reason: "Low value noise." });
		});

		const result = await runCurator({ ...baseArgs, maxDropsAllowed: 1, protectedObservationIds: ["cccccccccccc"], agentLoop: loop });

		expect(result?.dropped).toHaveLength(1);
		expect(result?.dropped).not.toContain("cccccccccccc");
	});

	it("returns undefined when the model marks no actions", async () => {
		const loop = fakeAgentLoop(async (_prompts, context) => {
			const tool = context.tools.find((candidate: any) => candidate.name === "mark_no_actions")!;
			await tool.execute("tool-1", {});
		});

		await expect(runCurator({ ...baseArgs, agentLoop: loop })).resolves.toBeUndefined();
	});

	it("renders pinned and flagged state in the prompt", async () => {
		let userText = "";
		const loop = fakeAgentLoop(async (prompts, context) => {
			userText = prompts[0].content[0].text ?? "";
			const tool = context.tools.find((candidate: any) => candidate.name === "mark_no_actions")!;
			await tool.execute("tool-1", {});
		});

		await runCurator({ ...baseArgs, pinnedObservationIds: ["aaaaaaaaaaaa"], flaggedObservationIds: ["bbbbbbbbbbbb"], agentLoop: loop });

		expect(userText).toContain("REVIEWED OBSERVATIONS");
		expect(userText).toContain("[aaaaaaaaaaaa]");
		expect(userText).toContain("[state: pinned]");
		expect(userText).toContain("[state: flagged]");
	});
});
