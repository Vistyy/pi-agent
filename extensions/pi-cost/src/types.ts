export const PI_USAGE_RECORDED = "pi.usage.recorded";

export type UsageTotals = {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	totalTokens: number;
	cost: number;
};

export type UsageRecordedData = {
	schemaVersion: 1;
	source: "extension";
	extension: string;
	agent?: string;
	operation?: string;
	tags?: Record<string, string>;
	model?: { provider?: string; id?: string };
	usage: UsageTotals;
};

type EntryLike = { type?: unknown; customType?: unknown; data?: unknown };

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function nonNegativeNumber(value: unknown): number {
	return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
}

function optionalString(value: unknown): string | undefined {
	return typeof value === "string" && value.length > 0 ? value : undefined;
}

function normalizeTags(value: unknown): Record<string, string> | undefined {
	if (!isRecord(value)) return undefined;
	const tags: Record<string, string> = {};
	for (const [key, tagValue] of Object.entries(value)) {
		if (key && typeof tagValue === "string" && tagValue.length > 0) tags[key] = tagValue;
	}
	return Object.keys(tags).length > 0 ? tags : undefined;
}

function normalizeModel(value: unknown): { provider?: string; id?: string } | undefined {
	if (!isRecord(value)) return undefined;
	const model = { provider: optionalString(value.provider), id: optionalString(value.id) };
	return model.provider || model.id ? model : undefined;
}

export function normalizeUsage(value: unknown): UsageTotals {
	const usage = isRecord(value) ? value : {};
	const cost = isRecord(usage.cost) ? nonNegativeNumber(usage.cost.total) : nonNegativeNumber(usage.cost);
	const input = nonNegativeNumber(usage.input);
	const output = nonNegativeNumber(usage.output);
	const cacheRead = nonNegativeNumber(usage.cacheRead);
	const cacheWrite = nonNegativeNumber(usage.cacheWrite);
	return {
		input,
		output,
		cacheRead,
		cacheWrite,
		totalTokens: nonNegativeNumber(usage.totalTokens) || input + output + cacheRead + cacheWrite,
		cost,
	};
}

export function buildUsageRecordedData(args: Omit<UsageRecordedData, "schemaVersion" | "source" | "usage"> & { usage: unknown }): UsageRecordedData {
	return {
		schemaVersion: 1,
		source: "extension",
		extension: args.extension,
		...(args.agent ? { agent: args.agent } : {}),
		...(args.operation ? { operation: args.operation } : {}),
		...(args.tags ? { tags: args.tags } : {}),
		...(args.model ? { model: args.model } : {}),
		usage: normalizeUsage(args.usage),
	};
}

export function isUsageRecordedData(value: unknown): value is UsageRecordedData {
	if (!isRecord(value)) return false;
	return value.schemaVersion === 1 && value.source === "extension" && typeof value.extension === "string" && value.extension.length > 0 && isRecord(value.usage);
}

export function isUsageRecordedEntry(entry: EntryLike): entry is EntryLike & { customType: typeof PI_USAGE_RECORDED; data: UsageRecordedData } {
	return entry.type === "custom" && entry.customType === PI_USAGE_RECORDED && isUsageRecordedData(entry.data);
}
