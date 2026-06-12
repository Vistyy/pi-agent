import { describe, expect, it } from "vitest";

import {
	OM_AGENT_USAGE_RECORDED,
	buildAgentUsageRecordedData,
	foldAgentUsage,
	isAgentUsageRecordedEntry,
	type Entry,
} from "../src/session-ledger/index.js";

function usageEntry(id: string, data: unknown): Entry {
	return {
		type: "custom",
		id,
		customType: OM_AGENT_USAGE_RECORDED,
		data,
	};
}

const baseUsage = {
	input: 100,
	output: 20,
	cacheRead: 30,
	cacheWrite: 4,
	totalTokens: 154,
	cost: {
		input: 0.001,
		output: 0.002,
		cacheRead: 0.0003,
		cacheWrite: 0.0004,
		total: 0.0037,
	},
};

describe("agent usage ledger", () => {
	it("builds normalized persistent usage data", () => {
		const data = buildAgentUsageRecordedData({
			agent: "observer",
			requestIndex: 2,
			model: { provider: "anthropic", id: "claude" },
			thinkingLevel: "low",
			durationMs: 1234,
			stopReason: "toolUse",
			usage: baseUsage,
		});

		expect(data).toEqual({
			schemaVersion: 1,
			agent: "observer",
			requestIndex: 2,
			model: { provider: "anthropic", id: "claude" },
			thinkingLevel: "low",
			durationMs: 1234,
			stopReason: "toolUse",
			usage: baseUsage,
		});
	});

	it("recognizes usage custom entries", () => {
		const entry = usageEntry("usage-1", buildAgentUsageRecordedData({ agent: "reflector", usage: baseUsage }));

		expect(isAgentUsageRecordedEntry(entry)).toBe(true);
		expect(isAgentUsageRecordedEntry({ ...entry, type: "custom_message" })).toBe(false);
		expect(isAgentUsageRecordedEntry({ ...entry, customType: "other" })).toBe(false);
	});

	it("folds persisted usage by agent and total", () => {
		const entries: Entry[] = [
			usageEntry("usage-1", buildAgentUsageRecordedData({ agent: "observer", usage: baseUsage })),
			usageEntry("usage-2", buildAgentUsageRecordedData({
				agent: "curator",
				usage: {
					input: 50,
					output: 10,
					cacheRead: 5,
					cacheWrite: 1,
					totalTokens: 66,
					cost: { input: 0.01, output: 0.02, cacheRead: 0.003, cacheWrite: 0.004, total: 0.037 },
				},
			})),
		];

		const summary = foldAgentUsage(entries);

		expect(summary.observer).toMatchObject({ input: 100, output: 20, cacheRead: 30, cacheWrite: 4, totalTokens: 154, cost: 0.0037, requests: 1 });
		expect(summary.curator).toMatchObject({ input: 50, output: 10, cacheRead: 5, cacheWrite: 1, totalTokens: 66, cost: 0.037, requests: 1 });
		expect(summary.reflector.requests).toBe(0);
		expect(summary.total).toMatchObject({ input: 150, output: 30, cacheRead: 35, cacheWrite: 5, totalTokens: 220, cost: 0.0407, requests: 2 });
	});

	it("normalizes malformed values and unknown agents safely", () => {
		const entries: Entry[] = [
			usageEntry("usage-1", {
				schemaVersion: 1,
				agent: "future-agent",
				usage: { input: Number.NaN, output: 12, cacheRead: -1, totalTokens: 12, cost: { total: 0.5 } },
			}),
			{ type: "message", id: "msg-1", message: { role: "assistant", usage: baseUsage } },
		];

		const summary = foldAgentUsage(entries);

		expect(summary.unknown).toMatchObject({ input: 0, output: 12, cacheRead: 0, cacheWrite: 0, totalTokens: 12, cost: 0.5, requests: 1 });
		expect(summary.total.requests).toBe(1);
	});
});
