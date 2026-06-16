import { isUsageRecordedEntry, normalizeUsage, type UsageRecordedData, type UsageTotals } from "./types.js";

export type CostBucket = UsageTotals & { requests: number };

export type ExtensionCost = CostBucket & {
	agents: Map<string, CostBucket>;
	operations: Map<string, CostBucket>;
	models: Map<string, CostBucket>;
	tags: Map<string, Map<string, CostBucket>>;
};

export type CostBreakdown = {
	main: CostBucket;
	extensionsTotal: CostBucket;
	total: CostBucket;
	extensions: Map<string, ExtensionCost>;
	models: Map<string, CostBucket>;
};

type EntryLike = { type?: unknown; customType?: unknown; data?: unknown; message?: unknown };

type AssistantUsage = { role?: unknown; provider?: unknown; model?: unknown; usage?: unknown };

export function emptyBucket(): CostBucket {
	return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: 0, requests: 0 };
}

function emptyExtension(): ExtensionCost {
	return { ...emptyBucket(), agents: new Map(), operations: new Map(), models: new Map(), tags: new Map() };
}

function addUsage(bucket: CostBucket, usage: UsageTotals): void {
	bucket.input += usage.input;
	bucket.output += usage.output;
	bucket.cacheRead += usage.cacheRead;
	bucket.cacheWrite += usage.cacheWrite;
	bucket.totalTokens += usage.totalTokens;
	bucket.cost += usage.cost;
	bucket.requests++;
}

function bucketFor(map: Map<string, CostBucket>, key: string): CostBucket {
	let bucket = map.get(key);
	if (!bucket) {
		bucket = emptyBucket();
		map.set(key, bucket);
	}
	return bucket;
}

function extensionFor(map: Map<string, ExtensionCost>, key: string): ExtensionCost {
	let bucket = map.get(key);
	if (!bucket) {
		bucket = emptyExtension();
		map.set(key, bucket);
	}
	return bucket;
}

function modelKey(model: UsageRecordedData["model"]): string | undefined {
	if (!model?.provider && !model?.id) return undefined;
	return model.provider && model.id ? `${model.provider}/${model.id}` : model.id ?? model.provider;
}

function assistantUsage(entry: EntryLike): { usage: UsageTotals; model?: string } | undefined {
	if (entry.type !== "message" || !entry.message || typeof entry.message !== "object") return undefined;
	const message = entry.message as AssistantUsage;
	if (message.role !== "assistant") return undefined;
	const usage = normalizeUsage(message.usage);
	const provider = typeof message.provider === "string" ? message.provider : undefined;
	const id = typeof message.model === "string" ? message.model : undefined;
	return { usage, model: provider && id ? `${provider}/${id}` : id ?? provider };
}

export function foldCost(entries: EntryLike[]): CostBreakdown {
	const breakdown: CostBreakdown = {
		main: emptyBucket(),
		extensionsTotal: emptyBucket(),
		total: emptyBucket(),
		extensions: new Map(),
		models: new Map(),
	};

	for (const entry of entries) {
		const main = assistantUsage(entry);
		if (main) {
			addUsage(breakdown.main, main.usage);
			addUsage(breakdown.total, main.usage);
			if (main.model) addUsage(bucketFor(breakdown.models, main.model), main.usage);
			continue;
		}

		if (!isUsageRecordedEntry(entry)) continue;
		const data = entry.data;
		const usage = normalizeUsage(data.usage);
		const extension = extensionFor(breakdown.extensions, data.extension);
		addUsage(extension, usage);
		addUsage(breakdown.extensionsTotal, usage);
		addUsage(breakdown.total, usage);
		if (data.agent) addUsage(bucketFor(extension.agents, data.agent), usage);
		if (data.operation) addUsage(bucketFor(extension.operations, data.operation), usage);
		const model = modelKey(data.model);
		if (model) {
			addUsage(bucketFor(extension.models, model), usage);
			addUsage(bucketFor(breakdown.models, model), usage);
		}
		for (const [tagKey, tagValue] of Object.entries(data.tags ?? {})) {
			let values = extension.tags.get(tagKey);
			if (!values) {
				values = new Map();
				extension.tags.set(tagKey, values);
			}
			addUsage(bucketFor(values, tagValue), usage);
		}
	}

	return breakdown;
}
