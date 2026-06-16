import { describe, expect, it, vi } from "vitest";
import { registerCostCommand } from "../src/commands/cost.js";
import { buildUsageRecordedData, PI_USAGE_RECORDED } from "../src/types.js";
import { foldCost } from "../src/fold.js";

const mainEntry = {
	type: "message",
	message: {
		role: "assistant",
		provider: "anthropic",
		model: "claude",
		usage: { input: 10, output: 5, cacheRead: 20, cacheWrite: 1, totalTokens: 36, cost: { total: 0.1 } },
	},
};

const omEntry = {
	type: "custom",
	customType: PI_USAGE_RECORDED,
	data: buildUsageRecordedData({
		extension: "om",
		agent: "observer",
		operation: "memory-update",
		model: { provider: "openai", id: "mini" },
		usage: { input: 30, output: 10, cacheRead: 0, cacheWrite: 0, cost: 0.2 },
	}),
};

const forkEntry = {
	type: "custom",
	customType: PI_USAGE_RECORDED,
	data: buildUsageRecordedData({
		extension: "fork",
		agent: "child-agent",
		operation: "fork",
		tags: { effort: "deep" },
		usage: { input: 50, output: 20, cacheRead: 5, cacheWrite: 0, cost: 0.3 },
	}),
};

describe("pi-cost", () => {
	it("folds main assistant usage and extension usage", () => {
		const cost = foldCost([mainEntry, omEntry, forkEntry]);

		expect(cost.main.cost).toBe(0.1);
		expect(cost.extensionsTotal.cost).toBe(0.5);
		expect(cost.total.cost).toBeCloseTo(0.6);
		expect(cost.extensions.get("om")?.agents.get("observer")?.cost).toBe(0.2);
		expect(cost.extensions.get("fork")?.tags.get("effort")?.get("deep")?.cost).toBe(0.3);
	});

	it("registers /cost and renders full breakdown", async () => {
		let handler: ((args: unknown, ctx: any) => Promise<void>) | undefined;
		const pi = { registerCommand: vi.fn((_name, command) => { handler = command.handler; }) } as any;
		registerCostCommand(pi);
		const notify = vi.fn();

		await handler?.("full", { ui: { notify }, sessionManager: { getBranch: () => [mainEntry, omEntry, forkEntry] } });

		const output = notify.mock.calls[0][0] as string;
		expect(output).toContain("Total:");
		expect(output).toContain("om:");
		expect(output).toContain("Tag effort");
		expect(output).toContain("deep:");
	});
});
