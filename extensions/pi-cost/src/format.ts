import type { CostBreakdown, CostBucket, ExtensionCost } from "./fold.js";

function money(value: number): string {
	return `$${value.toFixed(value < 1 ? 4 : 2)}`;
}

function tokens(value: number): string {
	if (value < 1_000) return String(Math.round(value));
	if (value < 1_000_000) return `${(value / 1_000).toFixed(value < 10_000 ? 1 : 0)}k`;
	return `${(value / 1_000_000).toFixed(1)}m`;
}

function summary(bucket: CostBucket): string {
	return `${money(bucket.cost)} / ${bucket.requests.toLocaleString()} req / ${tokens(bucket.totalTokens)} tok`;
}

function sortedEntries<T extends CostBucket>(map: Map<string, T>): Array<[string, T]> {
	return Array.from(map.entries()).sort((a, b) => b[1].cost - a[1].cost || a[0].localeCompare(b[0]));
}

function line(label: string, bucket: CostBucket): string {
	return `${label.padEnd(14)} ${summary(bucket)}`;
}

export function formatCostDefault(cost: CostBreakdown): string {
	const lines = [
		"Cost",
		"",
		line("Total:", cost.total),
		line("Main:", cost.main),
		line("Extensions:", cost.extensionsTotal),
	];
	if (cost.extensions.size > 0) {
		lines.push("", "Extensions");
		for (const [name, bucket] of sortedEntries(cost.extensions)) lines.push(line(`${name}:`, bucket));
	}
	return lines.join("\n");
}

function pushNested(lines: string[], title: string, map: Map<string, CostBucket>, indent = "  "): void {
	if (map.size === 0) return;
	lines.push(`${indent}${title}`);
	for (const [name, bucket] of sortedEntries(map)) lines.push(`${indent}  ${line(`${name}:`, bucket)}`);
}

function pushExtensionFull(lines: string[], name: string, bucket: ExtensionCost): void {
	lines.push(line(`${name}:`, bucket));
	pushNested(lines, "Agents", bucket.agents);
	pushNested(lines, "Operations", bucket.operations);
	for (const [tagKey, tagValues] of Array.from(bucket.tags.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
		pushNested(lines, `Tag ${tagKey}`, tagValues);
	}
	pushNested(lines, "Models", bucket.models);
}

export function formatCostFull(cost: CostBreakdown): string {
	const lines = [
		"Cost",
		"",
		line("Total:", cost.total),
		line("Main:", cost.main),
		line("Extensions:", cost.extensionsTotal),
	];
	if (cost.extensions.size > 0) {
		lines.push("", "Extensions");
		for (const [name, bucket] of sortedEntries(cost.extensions)) pushExtensionFull(lines, name, bucket);
	}
	pushNested(lines, "Models", cost.models, "");
	return lines.join("\n");
}
