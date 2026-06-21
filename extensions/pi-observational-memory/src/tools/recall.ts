import type { AgentToolResult } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";
import type { Message, ToolResultMessage } from "@earendil-works/pi-ai";
import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import {
	recallMemorySources,
	type Entry,
	type RecallProvenanceEdge,
	type RecallResult,
	type RecalledObservation,
} from "../session-ledger/recall.js";
import type { Observation, Reflection } from "../session-ledger/index.js";
import { renderRecallSourceEntries, renderRecallSourceEntry } from "../memory/serialization/recall.js";
import { isLegacyMemoryId, observationId } from "../memory/ids.js";
import { estimateEntryTokens } from "../memory/token-estimate.js";

export const RECALL_OBSERVATION_TOOL_NAME = "recall";

export const RECALL_TOOL_TEXT = {
	description: "Recover source evidence and provenance for a known observational-memory id on the current branch.",
	promptSnippet: "Use recall(<id>) when a known compacted-memory id needs exact evidence or provenance.",
	promptGuidelines: [
		"Use recall when a decision depends on details hidden behind a specific compacted-memory id.",
		"Use recall when the user asks for the evidence, source context, or provenance behind a known memory.",
		"Select only the specific memory id or ids whose hidden details are needed for the answer; do not recall every id in a memory excerpt or nearby ids from unrelated topics.",
		"Use mode: \"provenance\" only when intermediate reflection contents are needed, not just their ids; otherwise use the default evidence mode.",
		"includeIntermediate is a legacy alias for provenance mode; prefer mode for new calls.",
		"Do not use recall as semantic search or transcript browsing; you must already have a specific obs_*, ref_*, or legacy 12-character memory id.",
		"Do not recall ids whose details are already clear from recent conversation or active context.",
	],
	idDescription: "Specific typed obs_* or ref_* memory id, or legacy 12-character lowercase hex id. This tool does not search by topic.",
	modeDescription: "Recall rendering mode. evidence returns requested memory, terminal observations, source entries, and intermediate refs as provenance ids. provenance also materializes intermediate reflection contents.",
	includeIntermediateDescription: "Legacy alias for mode: provenance. Prefer mode for new calls.",
	depthDescription: "Optional explicit cap on ref-to-ref provenance traversal depth. Omit to traverse all reachable supporting reflections.",
} as const;

const MEMORY_ID_PATTERN = /^(?:[a-f0-9]{12}|obs_[a-f0-9]{12}|ref_[a-f0-9]{12})$/;

export type RecallRenderMode = "evidence" | "provenance";

type RecallObservationToolStatus =
	| "ok"
	| "partial"
	| "invalid_id"
	| "not_found"
	| "no_source"
	| "source_unavailable";

type ObservationDetails = Pick<Observation, "id" | "content" | "timestamp"> & { status?: "active" };
type ReflectionDetails = Pick<Reflection, "id" | "content" | "sources" | "createdAt"> & { reflectionIndex: number };

export type RecallSourceEntryDetails = {
	id: string;
	origin: string;
	timestamp: string;
	tokens: number;
	qualifiers: string[];
	content?: string;
};

type RecallObservationMatchDetails = {
	status: "active" | "source_unavailable" | "no_source";
	observationEntryId: string;
	observationRecordIndex: number;
	observation: ObservationDetails;
	sourceEntryIds?: string[];
	sourceEntries?: RecallSourceEntryDetails[];
	missingSourceEntryIds?: string[];
	nonSourceEntryIds?: string[];
	sourceCharacterCount?: number;
};

type RecallUnavailableSupportingObservationDetails = {
	observationId: string;
};

type RecallUnavailableSupportingReflectionDetails = {
	reflectionId: string;
};

const MAX_RECALL_SOURCE_CHARS = 12_000;
const MAX_RECALL_SOURCE_ENTRIES = 20;
const MAX_RECALL_SOURCE_ENTRY_CONTENT_CHARS = 4_000;

export type RecallObservationToolDetails = {
	status: RecallObservationToolStatus;
	memoryId: string;
	observationId: string;
	collision: boolean;
	partial: boolean;
	reflections: ReflectionDetails[];
	supportingReflections: ReflectionDetails[];
	provenanceEdges: RecallProvenanceEdge[];
	directObservationMatches: RecallObservationMatchDetails[];
	observations: RecallObservationMatchDetails[];
	matches: RecallObservationMatchDetails[];
	sourceEntries: RecallSourceEntryDetails[];
	unavailableSupportingObservations: RecallUnavailableSupportingObservationDetails[];
	unavailableSupportingReflections: RecallUnavailableSupportingReflectionDetails[];
	depthLimitedReflectionIds: string[];
	missingSourceEntryIds: string[];
	nonSourceEntryIds: string[];
	sourceCharacterCount?: number;
	message?: string;
};

function pad(n: number): string {
	return n.toString().padStart(2, "0");
}

function fmtLocal(d: Date): string {
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatDisplayTimestamp(...values: Array<number | string | undefined>): string {
	for (const v of values) {
		if (v === undefined) continue;
		const d = new Date(v);
		if (!Number.isNaN(d.getTime())) return fmtLocal(d);
	}
	return "Unknown time";
}

function textContentBlocks(content: unknown): Array<Record<string, unknown>> {
	return Array.isArray(content) ? content.filter((block): block is Record<string, unknown> => !!block && typeof block === "object") : [];
}

function uniqueStrings(items: string[]): string[] {
	return Array.from(new Set(items));
}

function sourceOriginAndQualifiers(entry: Entry): { origin: string; timestamp: string; qualifiers: string[] } {
	if (entry.type === "message" && entry.message && typeof entry.message === "object") {
		const msg = entry.message as Message;
		const timestamp = formatDisplayTimestamp(msg.timestamp, entry.timestamp);
		if (msg.role === "user") return { origin: "User", timestamp, qualifiers: [] };
		if (msg.role === "assistant") {
			const toolCalls = uniqueStrings(
				textContentBlocks(msg.content)
					.filter((block) => block.type === "toolCall" && typeof block.name === "string")
					.map((block) => block.name as string),
			);
			return { origin: "Assistant", timestamp, qualifiers: toolCalls.length > 0 ? [`tool calls: ${toolCalls.join(", ")}`] : [] };
		}
		const toolName = (msg as ToolResultMessage).toolName;
		return { origin: `Tool result: ${typeof toolName === "string" && toolName ? toolName : "unknown"}`, timestamp, qualifiers: [] };
	}
	if (entry.type === "custom_message") {
		return {
			origin: "Custom message",
			timestamp: formatDisplayTimestamp(entry.timestamp),
			qualifiers: typeof entry.customType === "string" && entry.customType ? [`custom: ${entry.customType}`] : [],
		};
	}
	if (entry.type === "branch_summary") return { origin: "Branch summary", timestamp: formatDisplayTimestamp(entry.timestamp), qualifiers: [] };
	return { origin: entry.type || "Entry", timestamp: formatDisplayTimestamp(entry.timestamp), qualifiers: [] };
}

function truncateText(text: string, maxChars: number): { text: string; truncated: boolean } {
	if (text.length <= maxChars) return { text, truncated: false };
	return { text: `${text.slice(0, Math.max(0, maxChars - 35)).trimEnd()}\n[truncated ${text.length - maxChars} characters]`, truncated: true };
}

function renderSourceEntryContentOnly(entry: Entry): string | undefined {
	const rendered = renderRecallSourceEntry(entry);
	return rendered?.replace(/^\[[^\]]+\]:\s?/, "") || undefined;
}

function sourceEntryDetails(entry: Entry, includeContent: boolean): RecallSourceEntryDetails {
	const { origin, timestamp, qualifiers } = sourceOriginAndQualifiers(entry);
	const content = renderSourceEntryContentOnly(entry);
	const boundedContent = content ? truncateText(content, MAX_RECALL_SOURCE_ENTRY_CONTENT_CHARS) : undefined;
	return {
		id: entry.id,
		origin,
		timestamp,
		tokens: estimateEntryTokens(entry),
		qualifiers,
		...(includeContent && boundedContent ? { content: boundedContent.text } : {}),
	};
}

function sourceEntryDetailsList(entries: Entry[], includeContent: boolean): RecallSourceEntryDetails[] {
	return entries.slice(0, MAX_RECALL_SOURCE_ENTRIES).map((entry) => sourceEntryDetails(entry, includeContent));
}

function observationDetails(observation: Observation, status?: "active"): ObservationDetails {
	return { id: observation.id, content: observation.content, timestamp: observation.timestamp, ...(status ? { status } : {}) };
}

function reflectionDetails(reflection: Reflection, reflectionIndex: number): ReflectionDetails {
	return { id: reflection.id, content: reflection.content, sources: reflection.sources, createdAt: reflection.createdAt, reflectionIndex };
}

function observationMatchDetails(match: RecalledObservation, includeSourceContent = true): RecallObservationMatchDetails {
	const unavailable = match.missingSourceEntryIds.length > 0 || match.nonSourceEntryIds.length > 0;
	const status = unavailable ? "source_unavailable" : match.sourceEntries.length === 0 ? "no_source" : match.status;
	return {
		status,
		observationEntryId: match.observationEntryId,
		observationRecordIndex: match.observationRecordIndex,
		observation: observationDetails(match.observation, match.status),
		sourceEntryIds: match.sourceEntryIds,
		sourceEntries: sourceEntryDetailsList(match.sourceEntries, includeSourceContent),
		missingSourceEntryIds: match.missingSourceEntryIds,
		nonSourceEntryIds: match.nonSourceEntryIds,
		sourceCharacterCount: renderRecallSourceEntries(match.sourceEntries).length,
	};
}

function textResult(text: string, details: RecallObservationToolDetails) {
	return { content: [{ type: "text" as const, text }], details };
}

function emptyDetails(status: RecallObservationToolStatus, memoryId: string, message: string): RecallObservationToolDetails {
	return {
		status,
		memoryId,
		observationId: memoryId,
		collision: false,
		partial: false,
		reflections: [],
		supportingReflections: [],
		provenanceEdges: [],
		directObservationMatches: [],
		observations: [],
		matches: [],
		sourceEntries: [],
		unavailableSupportingObservations: [],
		unavailableSupportingReflections: [],
		depthLimitedReflectionIds: [],
		missingSourceEntryIds: [],
		nonSourceEntryIds: [],
		message,
	};
}

function aggregateStatus(details: Omit<RecallObservationToolDetails, "status">): RecallObservationToolStatus {
	const observationOnly = details.reflections.length === 0 && details.unavailableSupportingObservations.length === 0;
	if (details.partial) return "partial";
	if (observationOnly && details.observations.some((match) => match.status === "source_unavailable")) return "source_unavailable";
	if (observationOnly && details.observations.length > 0 && details.sourceEntries.length === 0 && details.matches.every((match) => (match.sourceEntries ?? []).length === 0)) return "no_source";
	return "ok";
}

function friendlyNoSourceMessage(memoryId: string): string {
	return `Observation ${memoryId} has no source entries associated with it.`;
}

function friendlySourceUnavailableMessage(match: RecallObservationMatchDetails): string {
	const missing = match.missingSourceEntryIds && match.missingSourceEntryIds.length > 0 ? ` missing: ${match.missingSourceEntryIds.join(", ")}` : "";
	const nonSource = match.nonSourceEntryIds && match.nonSourceEntryIds.length > 0 ? ` non-source: ${match.nonSourceEntryIds.join(", ")}` : "";
	return `Observation ${match.observation.id} has source entries associated, but some are unavailable on the current branch or are not source-renderable.${missing}${nonSource}`;
}

function reflectionLineText(reflection: ReflectionDetails): string {
	return `[${reflection.id}] ${reflection.content}`;
}

function observationLineText(observation: ObservationDetails): string {
	const status = "";
	return `[${observation.id}]${status} ${observation.timestamp} ${observation.content}`;
}

function directObservationMatches(result: Extract<RecallResult, { status: "found" }>): RecalledObservation[] {
	const lookupId = isLegacyMemoryId(result.memoryId) ? observationId(result.memoryId) : result.memoryId;
	return result.observations.filter((match) => match.observation.id === lookupId);
}

type BoundedSourceText = {
	text: string;
	originalCharacterCount: number;
	truncated: boolean;
	omittedEntryCount: number;
};

function renderRecallSourceEntriesBounded(entries: Entry[]): BoundedSourceText {
	const blocks: string[] = [];
	let originalCharacterCount = 0;
	let truncated = false;
	let omittedEntryCount = 0;
	for (const entry of entries) {
		const rendered = renderRecallSourceEntry(entry);
		if (!rendered || rendered.trim().length === 0) continue;
		originalCharacterCount += rendered.length;
		if (blocks.length >= MAX_RECALL_SOURCE_ENTRIES) {
			omittedEntryCount += 1;
			truncated = true;
			continue;
		}
		const prefix = blocks.length > 0 ? "\n\n" : "";
		const remaining = MAX_RECALL_SOURCE_CHARS - blocks.join("\n\n").length - prefix.length;
		if (remaining <= 0) {
			omittedEntryCount += 1;
			truncated = true;
			continue;
		}
		const bounded = truncateText(rendered, remaining);
		blocks.push(bounded.text);
		if (bounded.truncated) {
			truncated = true;
			omittedEntryCount += 1;
		}
	}
	let text = blocks.join("\n\n");
	if (truncated) {
		const note = `[recall sources truncated: rendered ${Math.min(originalCharacterCount, MAX_RECALL_SOURCE_CHARS).toLocaleString()} of ${originalCharacterCount.toLocaleString()} chars; omitted ${omittedEntryCount.toLocaleString()} entr${omittedEntryCount === 1 ? "y" : "ies"}]`;
		text = text ? `${text}\n\n${note}` : note;
	}
	return { text, originalCharacterCount, truncated, omittedEntryCount };
}

function renderObservationOnlyTextFromResult(result: Extract<RecallResult, { status: "found" }>): string {
	const sections: string[] = [];
	if (result.collision) sections.push(`Memory id ${result.memoryId} matched multiple observations; returning all matching source results from the current branch.`);
	const matches = directObservationMatches(result);
	if (matches.length > 0) sections.push(`Observations:\n${matches.map((match) => observationLineText(observationDetails(match.observation, match.status))).join("\n")}`);
	for (const match of matches) {
		if (match.missingSourceEntryIds.length > 0 || match.nonSourceEntryIds.length > 0) {
			sections.push(friendlySourceUnavailableMessage(observationMatchDetails(match, false)));
			continue;
		}
		if (match.sourceEntries.length === 0) {
			sections.push(friendlyNoSourceMessage(match.observation.id));
			continue;
		}
		const sourceText = renderRecallSourceEntriesBounded(match.sourceEntries).text;
		sections.push(sourceText.trim() ? `Sources:\n${sourceText}` : `Observation ${match.observation.id} has source entries associated, but they rendered no text content.`);
	}
	return sections.join("\n\n");
}

function unavailableSupportingLineText(item: RecallUnavailableSupportingObservationDetails): string {
	return `Supporting observation ${item.observationId} is unavailable on the current branch.`;
}

function unavailableSupportingReflectionLineText(item: RecallUnavailableSupportingReflectionDetails): string {
	return `Supporting reflection ${item.reflectionId} is unavailable on the current branch.`;
}

function provenanceLineText(edge: RecallProvenanceEdge): string {
	return `${edge.fromId} -> ${edge.toId}`;
}

function renderMemoryText(result: Extract<RecallResult, { status: "found" }>, mode: RecallRenderMode): string {
	const sections: string[] = [];
	if (result.collision) sections.push(`Memory id ${result.memoryId} matched multiple observations/reflections; returning all available evidence from the current branch.`);
	if (result.reflections.length > 0) sections.push(`Reflections:\n${result.reflections.map((match) => reflectionLineText(reflectionDetails(match.reflection, match.reflectionRecordIndex))).join("\n")}`);
	if (mode === "provenance" && result.supportingReflections.length > 0) sections.push(`Supporting reflections:\n${result.supportingReflections.map((match) => reflectionLineText(reflectionDetails(match.reflection, match.reflectionRecordIndex))).join("\n")}`);
	if (result.provenanceEdges.length > 0) sections.push(`Provenance:\n${result.provenanceEdges.map(provenanceLineText).join("\n")}`);
	if (result.observations.length > 0) sections.push(`Observations:\n${result.observations.map((match) => observationLineText(observationDetails(match.observation, match.status))).join("\n")}`);
	if (result.missingSupportingObservationIds.length > 0) sections.push(`Unavailable supporting observations:\n${result.missingSupportingObservationIds.map((id) => unavailableSupportingLineText({ observationId: id })).join("\n")}`);
	if (result.missingSupportingReflectionIds.length > 0) sections.push(`Unavailable supporting reflections:\n${result.missingSupportingReflectionIds.map((id) => unavailableSupportingReflectionLineText({ reflectionId: id })).join("\n")}`);
	if (result.depthLimitedReflectionIds.length > 0) sections.push(`Depth-limited supporting reflections:\n${result.depthLimitedReflectionIds.join("\n")}`);
	if (result.missingSourceEntryIds.length > 0 || result.nonSourceEntryIds.length > 0) {
		const parts: string[] = [];
		if (result.missingSourceEntryIds.length > 0) parts.push(`missing: ${result.missingSourceEntryIds.join(", ")}`);
		if (result.nonSourceEntryIds.length > 0) parts.push(`non-source: ${result.nonSourceEntryIds.join(", ")}`);
		sections.push(`Unavailable source entries: ${parts.join("; ")}`);
	}
	const sourceText = renderRecallSourceEntriesBounded(result.sourceEntries).text;
	if (sourceText.trim()) sections.push(`Sources:\n${sourceText}`);
	if (sections.length === 0) sections.push(`Memory ${result.memoryId} was found, but no source evidence rendered.`);
	return sections.join("\n\n");
}

function resultDetails(result: Extract<RecallResult, { status: "found" }>, includeSourceContent = true): RecallObservationToolDetails {
	const reflections = result.reflections.map((match) => reflectionDetails(match.reflection, match.reflectionRecordIndex));
	const supportingReflections = result.supportingReflections.map((match) => reflectionDetails(match.reflection, match.reflectionRecordIndex));
	const observations = result.observations.map((match) => observationMatchDetails(match, includeSourceContent));
	const directMatches = directObservationMatches(result).map((match) => observationMatchDetails(match, includeSourceContent));
	const sourceEntries = sourceEntryDetailsList(result.sourceEntries, includeSourceContent);
	const boundedSourceText = renderRecallSourceEntriesBounded(result.sourceEntries);
	const detailWithoutStatus = {
		memoryId: result.memoryId,
		observationId: result.memoryId,
		collision: result.collision,
		partial: result.partial,
		reflections,
		supportingReflections,
		provenanceEdges: result.provenanceEdges,
		directObservationMatches: directMatches,
		observations,
		matches: directMatches,
		sourceEntries,
		unavailableSupportingObservations: result.missingSupportingObservationIds.map((observationId) => ({ observationId })),
		unavailableSupportingReflections: result.missingSupportingReflectionIds.map((reflectionId) => ({ reflectionId })),
		depthLimitedReflectionIds: result.depthLimitedReflectionIds,
		missingSourceEntryIds: result.missingSourceEntryIds,
		nonSourceEntryIds: result.nonSourceEntryIds,
		sourceCharacterCount: boundedSourceText.originalCharacterCount,
	};
	return { status: aggregateStatus(detailWithoutStatus), ...detailWithoutStatus };
}

function isObservationOnly(details: RecallObservationToolDetails): boolean {
	return details.reflections.length === 0 && details.supportingReflections.length === 0 && details.unavailableSupportingObservations.length === 0 && details.unavailableSupportingReflections.length === 0;
}

function recallRenderMode(params: { mode?: unknown; includeIntermediate?: unknown }): RecallRenderMode {
	if (params.mode === "provenance") return "provenance";
	if (params.mode === "evidence") return "evidence";
	if (params.includeIntermediate === true) return "provenance";
	return "evidence";
}

function renderFoundResult(result: Extract<RecallResult, { status: "found" }>, mode: RecallRenderMode): ReturnType<typeof textResult> {
	const details = resultDetails(result);
	const text = result.kind === "observation" ? renderObservationOnlyTextFromResult(result) : renderMemoryText(result, mode);
	return textResult(text, details);
}

function plural(n: number, singular: string, pluralForm = `${singular}s`): string {
	return `${n.toLocaleString()} ${n === 1 ? singular : pluralForm}`;
}

function sourceEntriesFromDetails(details: RecallObservationToolDetails): RecallSourceEntryDetails[] {
	if (!isObservationOnly(details)) return details.sourceEntries;
	return details.matches.flatMap((match) => match.sourceEntries ?? []);
}

function tokenSummary(tokens: number): string {
	return `~${tokens.toLocaleString()} ${tokens === 1 ? "token" : "tokens"}`;
}

function isFailureStatus(status: RecallObservationToolStatus): boolean {
	return status === "invalid_id" || status === "not_found";
}

function observationCountForHeader(details: RecallObservationToolDetails): number {
	return isObservationOnly(details) ? details.matches.length : details.observations.length;
}

export function formatRecallHeaderForTui(details: RecallObservationToolDetails): string {
	if (isFailureStatus(details.status)) return "× failure";
	const parts = ["✓ success"];
	if (details.reflections.length > 0) parts.push(plural(details.reflections.length, "reflection"));
	const observations = observationCountForHeader(details);
	if (observations > 0) parts.push(plural(observations, "observation"));
	const sources = sourceEntriesFromDetails(details);
	if (sources.length > 0) parts.push(plural(sources.length, "source"));
	const tokens = sources.reduce((sum, source) => sum + source.tokens, 0);
	if (tokens > 0) parts.push(tokenSummary(tokens));
	if (details.partial && details.status !== "ok") parts.push(details.status.replace(/_/g, " "));
	return parts.join(" · ");
}

const TUI_TYPE_WIDTH = 15;
const TUI_META_WIDTH = 31;

function alignedRow(type: string, meta: string, text: string): string {
	return `${type.padEnd(TUI_TYPE_WIDTH)} ${meta.padEnd(TUI_META_WIDTH)} ${text}`.trimEnd();
}

function sourceTag(source: RecallSourceEntryDetails): string {
	const origin = source.origin.trim().toLowerCase();
	if (origin === "user") return "user";
	if (origin === "assistant") return "assistant";
	if (origin.startsWith("tool result")) return "tool";
	if (origin.startsWith("custom message")) return "custom";
	if (origin.startsWith("branch summary")) return "summary";
	return origin.split(/[^a-z0-9]+/).find(Boolean) ?? "entry";
}

function sourceMetadataLine(source: RecallSourceEntryDetails): string {
	return alignedRow("✓ source", `${source.timestamp} [${sourceTag(source)}]`, tokenSummary(source.tokens));
}

function observationLine(observation: ObservationDetails): string {
	const status = "";
	return alignedRow("✓ observation", `${observation.timestamp}${status}`, observation.content);
}

function reflectionLine(reflection: ReflectionDetails): string {
	return alignedRow("✓ reflection", "", reflection.content);
}

function noteLine(kind: string, text: string): string {
	return alignedRow("• note", `[${kind}]`, text);
}

function indentContent(content: string): string {
	return content.split("\n").map((line) => `    ${line}`).join("\n");
}

function unavailableEvidenceMessage(_details: RecallObservationToolDetails): string {
	return "no source entries are available for this memory id";
}

function pushSourceLines(lines: string[], sources: RecallSourceEntryDetails[], expanded: boolean): void {
	for (const source of sources) {
		lines.push(sourceMetadataLine(source));
		if (expanded && source.content) {
			lines.push(indentContent(source.content));
			lines.push("");
		}
	}
}

function memoryRows(details: RecallObservationToolDetails): string[] {
	if (isObservationOnly(details)) return details.matches.map((match) => observationLine(match.observation));
	return [...details.reflections.map((reflection) => reflectionLine(reflection)), ...details.supportingReflections.map((reflection) => reflectionLine(reflection)), ...details.observations.map((observation) => observationLine(observation.observation))];
}

function noteRows(details: RecallObservationToolDetails, sources: RecallSourceEntryDetails[]): string[] {
	const notes: string[] = [];
	if (details.status === "invalid_id") {
		notes.push(noteLine("invalid id", `memory ids must be 12 lowercase hex characters; received ${details.memoryId}`));
		return notes;
	}
	if (details.status === "not_found") {
		notes.push(noteLine("not found", `no observation or reflection with id ${details.memoryId} was found on the current branch`));
		return notes;
	}
	if (details.collision) notes.push(noteLine("id collision", `multiple memory items share ${details.memoryId}`));
	if (details.unavailableSupportingObservations.length > 0) notes.push(noteLine("missing support", details.unavailableSupportingObservations.map((item) => item.observationId).join(", ")));
	if (details.unavailableSupportingReflections.length > 0) notes.push(noteLine("missing ref", details.unavailableSupportingReflections.map((item) => item.reflectionId).join(", ")));
	if (details.depthLimitedReflectionIds.length > 0) notes.push(noteLine("depth limit", details.depthLimitedReflectionIds.join(", ")));
	if (details.missingSourceEntryIds.length > 0) notes.push(noteLine("missing source", details.missingSourceEntryIds.join(", ")));
	if (details.nonSourceEntryIds.length > 0) notes.push(noteLine("non-source", details.nonSourceEntryIds.join(", ")));
	if (sources.length === 0 && (details.reflections.length > 0 || details.observations.length > 0 || details.matches.length > 0)) notes.push(noteLine("unavailable evidence", unavailableEvidenceMessage(details)));
	return notes;
}

export function formatRecallResultForTui(result: AgentToolResult<RecallObservationToolDetails>, expanded: boolean): string {
	const details = result.details;
	if (!details) {
		const text = result.content.filter((part): part is { type: "text"; text: string } => part.type === "text" && typeof part.text === "string").map((part) => part.text).join("\n");
		return text || "recall";
	}
	const sources = sourceEntriesFromDetails(details);
	const lines: string[] = [];
	const rows = memoryRows(details);
	const notes = noteRows(details, sources);
	lines.push(...rows);
	if (rows.length > 0 && notes.length > 0) lines.push("");
	lines.push(...notes);
	if ((rows.length > 0 || notes.length > 0) && sources.length > 0) lines.push("");
	pushSourceLines(lines, sources, expanded);
	if (!expanded && sources.some((source) => source.content)) lines.push("", "(Ctrl+O to expand)");
	return lines.join("\n").trimEnd();
}

export function formatRecallCallForTui(id: string | undefined): string {
	return `recall ${id ?? "..."}`;
}

export function formatRecallRenderedResultForTui(result: AgentToolResult<RecallObservationToolDetails>, expanded: boolean): string {
	const body = formatRecallResultForTui(result, expanded);
	const header = result.details ? formatRecallHeaderForTui(result.details) : undefined;
	if (header && body) return `\n${header}\n\n${body}`;
	if (header) return `\n${header}`;
	return body ? `\n${body}` : "";
}

export const recallObservationTool = defineTool({
	name: RECALL_OBSERVATION_TOOL_NAME,
	label: "Recall memory evidence",
	description: RECALL_TOOL_TEXT.description,
	promptSnippet: RECALL_TOOL_TEXT.promptSnippet,
	promptGuidelines: [...RECALL_TOOL_TEXT.promptGuidelines],
	executionMode: "parallel",
	parameters: Type.Object({
		id: Type.String({
			pattern: "^(?:[a-f0-9]{12}|obs_[a-f0-9]{12}|ref_[a-f0-9]{12})$",
			description: RECALL_TOOL_TEXT.idDescription,
		}),
		mode: Type.Optional(Type.Union([Type.Literal("evidence"), Type.Literal("provenance")], {
			description: RECALL_TOOL_TEXT.modeDescription,
		})),
		includeIntermediate: Type.Optional(Type.Boolean({
			description: RECALL_TOOL_TEXT.includeIntermediateDescription,
		})),
		depth: Type.Optional(Type.Number({
			description: RECALL_TOOL_TEXT.depthDescription,
		})),
	}),
	renderCall(args) {
		return new Text(formatRecallCallForTui(args.id), 0, 0);
	},
	renderResult(result, options) {
		return new Text(formatRecallRenderedResultForTui(result as AgentToolResult<RecallObservationToolDetails>, options.expanded), 0, 0);
	},
	async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
		const memoryId = params.id;
		if (!MEMORY_ID_PATTERN.test(memoryId)) {
			const message = `Memory id must be a typed obs_* or ref_* id, or a legacy 12-character lowercase hex id. Received: ${memoryId}`;
			return textResult(message, emptyDetails("invalid_id", memoryId, message));
		}
		const branchEntries = ctx.sessionManager.getBranch() as Entry[];
		const result = recallMemorySources(branchEntries, memoryId, { depth: typeof params.depth === "number" ? params.depth : undefined });
		if (result.status === "not_found") {
			const message = `No observation or reflection with id ${memoryId} was found on the current branch.`;
			return textResult(message, emptyDetails("not_found", memoryId, message));
		}
		return renderFoundResult(result, recallRenderMode(params));
	},
});

export function registerRecallTool(pi: ExtensionAPI): void {
	pi.registerTool(recallObservationTool);
}
