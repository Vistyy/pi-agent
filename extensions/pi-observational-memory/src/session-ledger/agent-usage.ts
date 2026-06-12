import type { MemoryAgentName } from "../agents/common.js";
import type { Entry } from "./types.js";

export const OM_AGENT_USAGE_RECORDED = "om.agent_usage.recorded";
export const OM_AGENT_RUN_RECORDED = "om.agent_run.recorded";

export type AgentNameWithUnknown = MemoryAgentName | "unknown";

export type AgentUsageSnapshot = {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	totalTokens: number;
	cost: {
		input: number;
		output: number;
		cacheRead: number;
		cacheWrite: number;
		total: number;
	};
};

export type AgentUsageRecordedData = {
	schemaVersion: 1;
	agent: AgentNameWithUnknown;
	requestIndex?: number;
	model?: { provider?: string; id?: string };
	thinkingLevel?: string;
	durationMs?: number;
	stopReason?: string;
	usage: AgentUsageSnapshot;
};

export type AgentRunRecordedData = {
	schemaVersion: 1;
	agent: AgentNameWithUnknown;
	status: "ok" | "skipped" | "error";
	reason?: string;
	durationMs: number;
	requestCount: number;
	costTotal: number;
	totalTokens: number;
	sourceEntryCount?: number;
	sourceTokenEstimate?: number;
	outputCount?: number;
	coversUpToId?: string;
	details?: Record<string, unknown>;
};

export type AgentUsageTotals = {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	totalTokens: number;
	cost: number;
	requests: number;
};

export type AgentUsageSummary = Record<AgentNameWithUnknown | "total", AgentUsageTotals>;

function emptyTotals(): AgentUsageTotals {
	return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: 0, requests: 0 };
}

function numberValue(value: unknown): number {
	return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === "object";
}

function agentName(value: unknown): AgentNameWithUnknown {
	return value === "observer" || value === "reflector" || value === "curator" ? value : "unknown";
}

export function normalizeUsage(value: unknown): AgentUsageSnapshot {
	const usage = isRecord(value) ? value : {};
	const cost = isRecord(usage.cost) ? usage.cost : {};
	return {
		input: numberValue(usage.input),
		output: numberValue(usage.output),
		cacheRead: numberValue(usage.cacheRead),
		cacheWrite: numberValue(usage.cacheWrite),
		totalTokens: numberValue(usage.totalTokens),
		cost: {
			input: numberValue(cost.input),
			output: numberValue(cost.output),
			cacheRead: numberValue(cost.cacheRead),
			cacheWrite: numberValue(cost.cacheWrite),
			total: numberValue(cost.total),
		},
	};
}

export function buildAgentUsageRecordedData(args: Omit<AgentUsageRecordedData, "schemaVersion" | "usage"> & { usage: unknown }): AgentUsageRecordedData {
	return { ...args, schemaVersion: 1, agent: agentName(args.agent), usage: normalizeUsage(args.usage) };
}

export function isAgentUsageRecordedEntry(entry: Entry): entry is Entry & { customType: typeof OM_AGENT_USAGE_RECORDED; data: AgentUsageRecordedData } {
	return entry.type === "custom" && entry.customType === OM_AGENT_USAGE_RECORDED && isRecord(entry.data) && isRecord(entry.data.usage);
}

export function foldAgentUsage(entries: Entry[]): AgentUsageSummary {
	const summary: AgentUsageSummary = {
		observer: emptyTotals(),
		reflector: emptyTotals(),
		curator: emptyTotals(),
		unknown: emptyTotals(),
		total: emptyTotals(),
	};
	for (const entry of entries) {
		if (!isAgentUsageRecordedEntry(entry)) continue;
		const agent = agentName(entry.data.agent);
		const usage = normalizeUsage(entry.data.usage);
		for (const target of [summary[agent], summary.total]) {
			target.input += usage.input;
			target.output += usage.output;
			target.cacheRead += usage.cacheRead;
			target.cacheWrite += usage.cacheWrite;
			target.totalTokens += usage.totalTokens;
			target.cost += usage.cost.total;
			target.requests++;
		}
	}
	return summary;
}
