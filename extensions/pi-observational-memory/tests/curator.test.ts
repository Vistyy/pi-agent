import { describe, expect, it } from "vitest";

import { runCurator, runCuratorPhased } from "../src/agents/curator/agent.js";
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

	it("aggregates multiple action tool calls in one curator pass", async () => {
		const loop = fakeAgentLoop(async (_prompts, context) => {
			await context.tools.find((candidate: any) => candidate.name === "pin_observations")!.execute("tool-1", { ids: ["aaaaaaaaaaaa"], reason: "Keep exact path visible." });
			await context.tools.find((candidate: any) => candidate.name === "flag_observations")!.execute("tool-2", { ids: ["aaaaaaaaaaaa"], reason: "Reflection omitted the path." });
			await context.tools.find((candidate: any) => candidate.name === "drop_observations")!.execute("tool-3", { ids: ["bbbbbbbbbbbb"], reason: "Noisy log." });
		});

		const result = await runCurator({ ...baseArgs, maxDropsAllowed: 1, agentLoop: loop });

		expect(result?.pinned).toEqual([{ observationIds: ["aaaaaaaaaaaa"], reason: "Keep exact path visible." }]);
		expect(result?.flagged).toEqual([{ observationIds: ["aaaaaaaaaaaa"], reason: "Reflection omitted the path." }]);
		expect(result?.dropped).toEqual(["bbbbbbbbbbbb"]);
	});

	it("ignores mark_no_actions after actions already exist", async () => {
		const loop = fakeAgentLoop(async (_prompts, context) => {
			await context.tools.find((candidate: any) => candidate.name === "pin_observations")!.execute("tool-1", { ids: ["aaaaaaaaaaaa"], reason: "Keep exact path visible." });
			await context.tools.find((candidate: any) => candidate.name === "mark_no_actions")!.execute("tool-2", {});
		});

		const result = await runCurator({ ...baseArgs, agentLoop: loop });

		expect(result?.pinned).toEqual([{ observationIds: ["aaaaaaaaaaaa"], reason: "Keep exact path visible." }]);
	});

	it("rejects same-run pin/unpin conflicts", async () => {
		const loop = fakeAgentLoop(async (_prompts, context) => {
			await context.tools.find((candidate: any) => candidate.name === "pin_observations")!.execute("tool-1", { ids: ["aaaaaaaaaaaa"], reason: "Keep exact path visible." });
			await context.tools.find((candidate: any) => candidate.name === "unpin_observations")!.execute("tool-2", { ids: ["aaaaaaaaaaaa"], reason: "No longer needed." });
		});

		const result = await runCurator({ ...baseArgs, pinnedObservationIds: ["aaaaaaaaaaaa"], agentLoop: loop });

		expect(result?.pinned).toEqual([{ observationIds: ["aaaaaaaaaaaa"], reason: "Keep exact path visible." }]);
		expect(result?.unpinned).toEqual([]);
	});

	it("drop conflicts remove prior pin and flag actions for the same id", async () => {
		const loop = fakeAgentLoop(async (_prompts, context) => {
			await context.tools.find((candidate: any) => candidate.name === "pin_observations")!.execute("tool-1", { ids: ["bbbbbbbbbbbb"], reason: "Maybe keep." });
			await context.tools.find((candidate: any) => candidate.name === "flag_observations")!.execute("tool-2", { ids: ["bbbbbbbbbbbb"], reason: "Maybe follow up." });
			await context.tools.find((candidate: any) => candidate.name === "drop_observations")!.execute("tool-3", { ids: ["bbbbbbbbbbbb"], reason: "Actually noise." });
		});

		const result = await runCurator({ ...baseArgs, maxDropsAllowed: 1, agentLoop: loop });

		expect(result?.pinned).toEqual([]);
		expect(result?.flagged).toEqual([]);
		expect(result?.dropped).toEqual(["bbbbbbbbbbbb"]);
	});

	it("returns undefined when the model marks no actions", async () => {
		const loop = fakeAgentLoop(async (_prompts, context) => {
			const tool = context.tools.find((candidate: any) => candidate.name === "mark_no_actions")!;
			await tool.execute("tool-1", {});
		});

		await expect(runCurator({ ...baseArgs, agentLoop: loop })).resolves.toBeUndefined();
	});

	it("rejects context-only observation ids with exact feedback", async () => {
		const contextOnly = observation("dddddddddddd", { content: "Related context only" });
		let details: any;
		let text = "";
		const loop = fakeAgentLoop(async (_prompts, context) => {
			const tool = context.tools.find((candidate: any) => candidate.name === "pin_observations")!;
			const response = await tool.execute("tool-1", { ids: ["aaaaaaaaaaaa", "dddddddddddd", "missing", "aaaaaaaaaaaa"], reason: "Keep exact path visible." });
			details = response.details;
			text = response.content[0].text;
		});

		const result = await runCurator({ ...baseArgs, observations: [obsA], contextObservations: [contextOnly], candidateObservationIds: ["aaaaaaaaaaaa"], agentLoop: loop });

		expect(result?.pinned).toEqual([{ observationIds: ["aaaaaaaaaaaa"], reason: "Keep exact path visible." }]);
		expect(details).toEqual({
			accepted: ["aaaaaaaaaaaa"],
			rejected: [
				{ id: "dddddddddddd", reason: "not_action_candidate" },
				{ id: "missing", reason: "not_action_candidate" },
				{ id: "aaaaaaaaaaaa", reason: "duplicate" },
			],
		});
		expect(text).toContain("dddddddddddd: not_action_candidate");
	});

	it("phased curator exposes only phase-specific tools and protects phase-one pins from drops", async () => {
		const toolNamesByCall: string[][] = [];
		const loop = fakeAgentLoop(async (_prompts, context) => {
			const names = context.tools.map((tool: any) => tool.name).sort();
			toolNamesByCall.push(names);
			if (names.includes("pin_observations")) {
				await context.tools.find((candidate: any) => candidate.name === "pin_observations")!.execute("tool-1", { ids: ["aaaaaaaaaaaa"], reason: "Keep exact path visible." });
				return;
			}
			if (names.includes("unpin_observations")) {
				await context.tools.find((candidate: any) => candidate.name === "mark_no_actions")!.execute("tool-2", {});
				return;
			}
			await context.tools.find((candidate: any) => candidate.name === "drop_observations")!.execute("tool-3", { ids: ["aaaaaaaaaaaa", "bbbbbbbbbbbb"], reason: "Drop noise." });
		});

		const result = await runCuratorPhased({ ...baseArgs, maxDropsAllowed: 2, agentLoop: loop });

		expect(toolNamesByCall).toEqual([
			["flag_observations", "mark_no_actions", "pin_observations"],
			["mark_no_actions", "unpin_observations"],
			["drop_observations", "mark_no_actions"],
		]);
		expect(result?.pinned).toEqual([{ observationIds: ["aaaaaaaaaaaa"], reason: "Keep exact path visible." }]);
		expect(result?.dropped).toEqual(["bbbbbbbbbbbb"]);
	});

	it("renders pinned and flagged state in the prompt", async () => {
		let userText = "";
		const loop = fakeAgentLoop(async (prompts, context) => {
			userText = prompts[0].content[0].text ?? "";
			const tool = context.tools.find((candidate: any) => candidate.name === "mark_no_actions")!;
			await tool.execute("tool-1", {});
		});

		await runCurator({ ...baseArgs, pinnedObservationIds: ["aaaaaaaaaaaa"], flaggedObservationIds: ["bbbbbbbbbbbb"], agentLoop: loop });

		expect(userText).toContain("ACTION CANDIDATES");
		expect(userText).toContain("[aaaaaaaaaaaa]");
		expect(userText).toContain("[state: pinned]");
		expect(userText).toContain("[state: flagged]");
	});
});
