import type { ToolResultMessage } from "@earendil-works/pi-ai";
import { formatTimestamp, textAndPlaceholders, truncateMiddle, type RenderableEntry } from "./shared.js";

export type SourceAddressedSerialization = {
	text: string;
	sourceEntryIds: string[];
};

const OBSERVER_ENTRY_MAX_CHARS = 12_000;
const OBSERVER_TOOL_EXCERPT_MAX_CHARS = 1_000;

function cleanBody(text: string): string {
	return text.split("\n").filter(Boolean).join("\n");
}

function compactToolExcerpt(text: string): string {
	const body = cleanBody(text);
	if (!body) return "[no textual output]";
	return truncateMiddle(body, OBSERVER_TOOL_EXCERPT_MAX_CHARS);
}

function renderObserverMessage(entry: RenderableEntry): string | null {
	if (!entry.message || typeof entry.message !== "object") return null;
	const msg = entry.message as Record<string, any>;
	const time = formatTimestamp(typeof msg.timestamp === "string" || typeof msg.timestamp === "number" ? msg.timestamp : entry.timestamp);

	if (msg.role === "user") {
		const body = cleanBody(textAndPlaceholders(msg.content));
		return body ? `[User @ ${time}]: ${truncateMiddle(body, OBSERVER_ENTRY_MAX_CHARS)}` : null;
	}
	if (msg.role === "assistant") {
		const body = cleanBody(textAndPlaceholders(msg.content, { omitRedactedThinking: true, includeThinking: false }));
		return body ? `[Assistant @ ${time}]: ${truncateMiddle(body, OBSERVER_ENTRY_MAX_CHARS)}` : null;
	}
	if (msg.role === "toolResult") {
		const toolName = (msg as ToolResultMessage).toolName ?? "unknown";
		const status = msg.isError === true ? "error" : "ok";
		const excerpt = compactToolExcerpt(textAndPlaceholders(msg.content));
		return `[Tool evidence: ${toolName} @ ${time}]\nstatus: ${status}\nexcerpt:\n${excerpt}`;
	}
	if (msg.role === "bashExecution") {
		const command = typeof msg.command === "string" ? msg.command : "";
		const output = typeof msg.output === "string" ? msg.output : "";
		const exitCode = typeof msg.exitCode === "number" ? msg.exitCode : "unknown";
		const truncated = msg.truncated === true ? "true" : "false";
		return `[Tool evidence: bash @ ${time}]\ncommand: ${command}\nexitCode: ${exitCode}\ntruncated: ${truncated}\nexcerpt:\n${compactToolExcerpt(output)}`;
	}
	if (msg.role === "custom") {
		const customType = typeof msg.customType === "string" ? msg.customType : "unknown";
		const body = cleanBody(textAndPlaceholders(msg.content));
		return body ? `[Custom message (${customType}) @ ${time}]: ${truncateMiddle(body, OBSERVER_ENTRY_MAX_CHARS)}` : null;
	}
	if (msg.role === "branchSummary" || msg.role === "compactionSummary") {
		const summary = typeof msg.summary === "string" ? msg.summary : "";
		return summary ? `[${msg.role} @ ${time}]: ${truncateMiddle(summary, OBSERVER_ENTRY_MAX_CHARS)}` : null;
	}
	return null;
}

function renderObserverSourceEntry(entry: RenderableEntry): string | null {
	if (entry.type === "message") return renderObserverMessage(entry);
	if (entry.type === "custom_message") {
		const time = formatTimestamp(entry.timestamp);
		const tag = entry.customType ? `Custom (${entry.customType})` : "Custom";
		const body = cleanBody(textAndPlaceholders(entry.content));
		return body ? `[${tag} @ ${time}]: ${truncateMiddle(body, OBSERVER_ENTRY_MAX_CHARS)}` : null;
	}
	if (entry.type === "branch_summary" && typeof entry.summary === "string") {
		const time = formatTimestamp(entry.timestamp);
		return `[Branch summary @ ${time}]: ${truncateMiddle(entry.summary, OBSERVER_ENTRY_MAX_CHARS)}`;
	}
	if (entry.type === "compaction" && typeof entry.summary === "string") {
		const time = formatTimestamp(entry.timestamp);
		const firstKept = entry.firstKeptEntryId ? `; first kept: ${entry.firstKeptEntryId}` : "";
		const tokensBefore = typeof entry.tokensBefore === "number" ? `; tokens before: ${entry.tokensBefore}` : "";
		return `[Compaction summary @ ${time}${firstKept}${tokensBefore}]: ${truncateMiddle(entry.summary, OBSERVER_ENTRY_MAX_CHARS)}`;
	}
	return null;
}

function isObserverSourceEntry(entry: RenderableEntry): boolean {
	return entry.type === "message" || entry.type === "custom_message" || entry.type === "branch_summary" || entry.type === "compaction";
}

export function serializeObserverSourceEntries(entries: RenderableEntry[]): SourceAddressedSerialization {
	const blocks: string[] = [];
	const sourceEntryIds: string[] = [];
	for (const entry of entries) {
		if (!entry.id || !isObserverSourceEntry(entry)) continue;
		const rendered = renderObserverSourceEntry(entry);
		if (!rendered?.trim()) continue;
		sourceEntryIds.push(entry.id);
		blocks.push(`[Source entry id: ${entry.id}]\n${rendered}`);
	}
	return { text: blocks.join("\n\n"), sourceEntryIds };
}
