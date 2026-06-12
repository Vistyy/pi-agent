import { agentLoop, type AgentTool } from "@earendil-works/pi-agent-core";
import type { Model, ModelThinkingLevel } from "@earendil-works/pi-ai";
import { Type } from "@earendil-works/pi-ai";
import type { Static } from "typebox";
import { hashId } from "../../memory/ids.js";
import { joinOrEmpty, normalizeAllowedIdsStrict, runMemoryAgentLoop, type MemoryAgentUsage } from "../common.js";
import { OBSERVER_SYSTEM } from "./prompts.js";
import { nowTimestamp, truncateRecordContent } from "../../memory/serialize.js";
import type { Observation } from "../../session-ledger/index.js";

interface RunObserverArgs {
	model: Model<any>;
	apiKey: string;
	headers?: Record<string, string>;
	priorReflections: string[];
	priorObservations: string[];
	chunk: string;
	allowedSourceEntryIds: string[];
	signal?: AbortSignal;
	agentLoop?: typeof agentLoop;
	maxTurns?: number;
	thinkingLevel?: ModelThinkingLevel;
	onUsage?: (usage: MemoryAgentUsage) => void;
}

export const OBSERVATION_TIMESTAMP_PATTERN = "^[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}$";

const MarkObservedNoObservationsSchema = Type.Object({});
type MarkObservedNoObservationsArgs = Static<typeof MarkObservedNoObservationsSchema>;

const RecordObservationsSchema = Type.Object({
	observations: Type.Array(
		Type.Object({
			content: Type.String({
				minLength: 1,
				description: "Single source-backed observation. Preserve exact names, paths, commands, errors, decisions, corrections, and current/stale relationships compactly.",
			}),
			timestamp: Type.String({
				pattern: OBSERVATION_TIMESTAMP_PATTERN,
				description: "Observation time in local 'YYYY-MM-DD HH:MM' format.",
			}),
			sourceEntryIds: Type.Array(
				Type.String({ minLength: 1 }),
				{
					minItems: 1,
					description:
						"Exact source entry ids from the chunk that directly support this observation. " +
						"Use only ids shown in '[Source entry id: ...]' labels; never invent ids.",
				},
			),
		}),
		{ description: "Batch of new observations. May be empty only if the tool is not called at all." },
	),
});
type RecordObservationsArgs = Static<typeof RecordObservationsSchema>;

export const normalizeSourceEntryIds = normalizeAllowedIdsStrict;

type RejectedSourceEntry = { id: string; reason: "missing_source_entry_ids" | "invalid_source_entry_id" };

function rejectedSourceEntries(ids: readonly string[] | undefined, allowedSourceEntryIds: readonly string[]): RejectedSourceEntry[] {
	if (!ids || ids.length === 0) return [{ id: "", reason: "missing_source_entry_ids" }];
	const allowed = new Set(allowedSourceEntryIds);
	const rejected: RejectedSourceEntry[] = [];
	const seen = new Set<string>();
	for (const id of ids) {
		if (seen.has(id)) continue;
		seen.add(id);
		if (!allowed.has(id)) rejected.push({ id, reason: "invalid_source_entry_id" });
	}
	return rejected;
}

export async function runObserver(args: RunObserverArgs): Promise<Observation[] | undefined> {
	const { model, apiKey, headers, priorReflections, priorObservations, chunk, allowedSourceEntryIds, signal } = args;
	const conversation = chunk.trim();
	if (!conversation) return undefined;

	const accumulated = new Map<string, Observation>();
	let reviewedNoObservations = false;

	const markObservedNoObservations: AgentTool<typeof MarkObservedNoObservationsSchema> = {
		name: "mark_observed_no_observations",
		label: "Mark observed",
		description: "Mark this chunk observed when it contains no durable observations to record. This tool call terminates the run.",
		parameters: MarkObservedNoObservationsSchema,
		execute: async (_id, _params: MarkObservedNoObservationsArgs) => {
			reviewedNoObservations = true;
			return { content: [{ type: "text", text: "Marked chunk observed with no durable observations." }], details: { reviewed: true }, terminate: true };
		},
	};

	const recordObservations: AgentTool<typeof RecordObservationsSchema> = {
		name: "record_observations",
		label: "Record observations",
		description:
			"Record one complete batch of observations distilled from the conversation chunk. " +
			"This tool call terminates the run, so include every durable observation to keep in this single call.",
		parameters: RecordObservationsSchema,
		execute: async (_id, params: RecordObservationsArgs) => {
			let added = 0;
			let duplicates = 0;
			let rejected = 0;
			const rejectedDetails: Array<{ content: string; sourceEntryIds: RejectedSourceEntry[] }> = [];
			for (const obs of params.observations) {
				const sourceEntryIds = normalizeSourceEntryIds(obs.sourceEntryIds, allowedSourceEntryIds);
				if (!sourceEntryIds) {
					rejected++;
					rejectedDetails.push({ content: truncateRecordContent(obs.content), sourceEntryIds: rejectedSourceEntries(obs.sourceEntryIds, allowedSourceEntryIds) });
					continue;
				}
				const content = truncateRecordContent(obs.content);
				const id = hashId(content);
				if (accumulated.has(id)) {
					duplicates++;
					continue;
				}
				accumulated.set(id, {
					id,
					content,
					timestamp: obs.timestamp,
					sourceEntryIds,
				});
				added++;
			}
			const rejectedSummary = rejectedDetails.flatMap((detail) => detail.sourceEntryIds.map((source) => source.id ? `${source.id}: ${source.reason}` : source.reason)).join(", ");
			const rejectedPart = rejected > 0
				? ` ${rejected} observation${rejected === 1 ? "" : "s"} rejected for missing or invalid sourceEntryIds${rejectedSummary ? ` (${rejectedSummary})` : ""}.`
				: "";
			const ack =
				`Recorded ${added} new observation${added === 1 ? "" : "s"} ` +
				(duplicates > 0 ? `(${duplicates} duplicate${duplicates === 1 ? "" : "s"} skipped).` : ".") +
				rejectedPart +
				` Total this run: ${accumulated.size}.`;
			return { content: [{ type: "text", text: ack }], details: { added, duplicates, rejected, rejectedDetails, total: accumulated.size }, terminate: true };
		},
	};

	const now = nowTimestamp();
	const userText = `Current local time: ${now}

CURRENT REFLECTIONS:
${joinOrEmpty(priorReflections)}

CURRENT OBSERVATIONS:
${joinOrEmpty(priorObservations)}

Compress the following new conversation chunk into observations. If it contains durable observations, call record_observations once with every durable observation to keep. If it contains no durable observations, call mark_observed_no_observations. Do not restate facts already present in current reflections or current observations. Prefer inline conversation timestamps when assigning times; fall back to the current local time above only if no message timestamp applies.

NEW CONVERSATION CHUNK:
${conversation}`;

	await runMemoryAgentLoop({
		model,
		apiKey,
		headers,
		signal,
		agentLoop: args.agentLoop,
		maxTurns: args.maxTurns,
		thinkingLevel: args.thinkingLevel,
		systemPrompt: OBSERVER_SYSTEM,
		userText,
		tools: [recordObservations as AgentTool<any>, markObservedNoObservations as AgentTool<any>],
		agentName: "observer",
		onUsage: args.onUsage,
	});

	if (accumulated.size === 0) return reviewedNoObservations ? [] : undefined;
	return Array.from(accumulated.values());
}
