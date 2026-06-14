import type { ToolResultMessage } from "@earendil-works/pi-ai";
import { formatTimestamp, textAndPlaceholders, truncateMiddle, type RenderableEntry } from "./shared.js";

export type SourceAddressedSerialization = {
	text: string;
	sourceEntryIds: string[];
};

export type ObserverToolRenderingOptions = {
	toolResultSummaryMaxChars: number;
	toolResultErrorMaxChars: number;
	toolResultsTotalMaxChars: number;
};

const OBSERVER_ENTRY_MAX_CHARS = 12_000;
type ToolBudget = { remaining: number };

function normalizeBody(text: string): string {
	return text.trim();
}

function excerptWithBudget(text: string, maxChars: number, budget: ToolBudget): { excerpt: string; omitted: boolean; reason?: string } {
	const body = normalizeBody(text);
	if (!body) return { excerpt: "[no textual output]", omitted: false };
	if (budget.remaining <= 0) return { excerpt: "[output omitted: observer tool excerpt budget exhausted]", omitted: true, reason: "budget_exhausted" };
	const allowed = Math.max(0, Math.min(maxChars, budget.remaining));
	if (allowed <= 0) return { excerpt: "[output omitted: observer tool excerpt budget exhausted]", omitted: true, reason: "budget_exhausted" };
	budget.remaining -= allowed;
	const excerpt = truncateMiddle(body, allowed);
	return {
		excerpt,
		omitted: body.length > allowed,
		reason: body.length > allowed ? `truncated_to_${allowed}_chars` : undefined,
	};
}

function inputSummary(msg: Record<string, any>): string | undefined {
	const candidates = [msg.command, msg.input, msg.path, msg.filePath, msg.name]
		.filter((value): value is string => typeof value === "string" && value.length > 0);
	if (candidates.length === 0) return undefined;
	return truncateMiddle(candidates.join(" "), 300);
}

function renderToolEvidence(args: {
	time: string;
	toolName: string;
	status: "ok" | "error";
	content: string;
	options: ObserverToolRenderingOptions;
	budget: ToolBudget;
	input?: string;
	exitCode?: number | string;
	truncated?: boolean;
}): string {
	const maxChars = args.status === "error" ? args.options.toolResultErrorMaxChars : args.options.toolResultSummaryMaxChars;
	const outputChars = normalizeBody(args.content).length;	const { excerpt, omitted, reason } = excerptWithBudget(args.content, maxChars, args.budget);
	const lines = [`[Tool evidence: ${args.toolName} @ ${args.time}]`, `status: ${args.status}`, `output_chars: ${outputChars}`];
	if (args.input) lines.push(`input: ${args.input}`);
	if (args.exitCode !== undefined) lines.push(`exitCode: ${args.exitCode}`);
	if (args.truncated !== undefined) lines.push(`tool_truncated: ${args.truncated ? "true" : "false"}`);
	lines.push(`output_omitted: ${omitted ? "true" : "false"}${reason ? ` (${reason})` : ""}`);
	lines.push("excerpt:");
	lines.push(excerpt);
	return lines.join("\n");
}

function renderObserverMessage(entry: RenderableEntry, options: ObserverToolRenderingOptions, budget: ToolBudget): string | null {
	if (!entry.message || typeof entry.message !== "object") return null;
	const msg = entry.message as Record<string, any>;
	const time = formatTimestamp(typeof msg.timestamp === "string" || typeof msg.timestamp === "number" ? msg.timestamp : entry.timestamp);

	if (msg.role === "user") {
		const body = normalizeBody(textAndPlaceholders(msg.content));
		return body ? `[User @ ${time}]: ${truncateMiddle(body, OBSERVER_ENTRY_MAX_CHARS)}` : null;
	}
	if (msg.role === "assistant") {
		const body = normalizeBody(textAndPlaceholders(msg.content, { omitRedactedThinking: true, includeThinking: false }));
		return body ? `[Assistant @ ${time}]: ${truncateMiddle(body, OBSERVER_ENTRY_MAX_CHARS)}` : null;
	}
	if (msg.role === "toolResult") {
		const toolName = (msg as ToolResultMessage).toolName ?? "unknown";
		const status = msg.isError === true ? "error" : "ok";
		return renderToolEvidence({
			time,
			toolName,
			status,
			content: textAndPlaceholders(msg.content),
			options,
			budget,
			input: inputSummary(msg),
		});
	}
	if (msg.role === "bashExecution") {
		const command = typeof msg.command === "string" ? msg.command : "";
		const output = typeof msg.output === "string" ? msg.output : "";
		const exitCode = typeof msg.exitCode === "number" ? msg.exitCode : "unknown";
		const status = typeof msg.exitCode === "number" && msg.exitCode !== 0 ? "error" : "ok";
		return renderToolEvidence({
			time,
			toolName: "bash",
			status,
			content: output,
			options,
			budget,
			input: command,
			exitCode,
			truncated: msg.truncated === true,
		});
	}
	return null;
}

function renderObserverSourceEntry(entry: RenderableEntry, options: ObserverToolRenderingOptions, budget: ToolBudget): string | null {
	if (entry.type === "message") return renderObserverMessage(entry, options, budget);
	return null;
}

function isObserverSourceEntry(entry: RenderableEntry): boolean {
	return entry.type === "message";
}

export function serializeObserverSourceEntries(
	entries: RenderableEntry[],
	options: ObserverToolRenderingOptions,
): SourceAddressedSerialization {
	const blocks: string[] = [];
	const sourceEntryIds: string[] = [];
	const budget = { remaining: options.toolResultsTotalMaxChars };
	for (const entry of entries) {
		if (!entry.id || !isObserverSourceEntry(entry)) continue;
		const rendered = renderObserverSourceEntry(entry, options, budget);
		if (!rendered?.trim()) continue;
		sourceEntryIds.push(entry.id);
		blocks.push(`[Source entry id: ${entry.id}]\n${rendered}`);
	}
	return { text: blocks.join("\n\n"), sourceEntryIds };
}
