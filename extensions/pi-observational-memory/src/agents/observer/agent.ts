import { agentLoop, type AgentContext, type AgentLoopConfig, type AgentTool } from "@earendil-works/pi-agent-core";
import type { Message, Model, ModelThinkingLevel } from "@earendil-works/pi-ai";
import { Type } from "@earendil-works/pi-ai";
import type { Static } from "typebox";
import { hashId } from "../../memory/ids.js";
import { AGENT_LOOP_MAX_TOKENS, boundedMaxTokens } from "../model-budget.js";
import { OBSERVER_SYSTEM } from "./prompts.js";
import { nowTimestamp, truncateRecordContent } from "../../memory/serialize.js";
import type { Observation, Relevance } from "../../session-ledger/index.js";
import { estimateStringTokens } from "../../memory/token-estimate.js";

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
}

const RelevanceSchema = Type.Union([
	Type.Literal("low"),
	Type.Literal("medium"),
	Type.Literal("high"),
	Type.Literal("critical"),
]);

export const OBSERVATION_TIMESTAMP_PATTERN = "^[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}$";

const RecordObservationsSchema = Type.Object({
	observations: Type.Array(
		Type.Object({
			event: Type.Object({
				title: Type.String({ minLength: 1, description: "Short event title." }),
				details: Type.Array(Type.String({ minLength: 1 }), {
					minItems: 1,
					description: "Exact compact details: paths, commands, errors, numbers, run results, decisions, rejected options, current state.",
				}),
				status: Type.Optional(Type.String({ minLength: 1 })),
				supersedes: Type.Optional(Type.Array(Type.String({ minLength: 1 }))),
			}),
			timestamp: Type.String({
				pattern: OBSERVATION_TIMESTAMP_PATTERN,
				description: "Observation time in local 'YYYY-MM-DD HH:MM' format.",
			}),
			content: Type.Optional(Type.String({
				minLength: 1,
				description: "Optional fallback single-line prose. If omitted, it is derived from event title and details.",
			})),
			relevance: RelevanceSchema,
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

function joinOrEmpty(items: string[]): string {
	return items.length ? items.join("\n") : "(none yet)";
}

export function normalizeSourceEntryIds(
	sourceEntryIds: readonly string[] | undefined,
	allowedSourceEntryIds: readonly string[],
): string[] | undefined {
	if (!sourceEntryIds || sourceEntryIds.length === 0) return undefined;
	const allowedOrder = new Map<string, number>();
	for (let i = 0; i < allowedSourceEntryIds.length; i++) allowedOrder.set(allowedSourceEntryIds[i], i);

	const seen = new Set<string>();
	for (const id of sourceEntryIds) {
		if (!allowedOrder.has(id)) return undefined;
		seen.add(id);
	}
	if (seen.size === 0) return undefined;
	return Array.from(seen).sort((a, b) => (allowedOrder.get(a) ?? 0) - (allowedOrder.get(b) ?? 0));
}

export async function runObserver(args: RunObserverArgs): Promise<Observation[] | undefined> {
	const { model, apiKey, headers, priorReflections, priorObservations, chunk, allowedSourceEntryIds, signal } = args;
	const conversation = chunk.trim();
	if (!conversation) return undefined;

	const accumulated = new Map<string, Observation>();

	const recordObservations: AgentTool<typeof RecordObservationsSchema> = {
		name: "record_observations",
		label: "Record observations",
		description:
			"Record a batch of new observations distilled from the conversation chunk. " +
			"Call this multiple times as you work through the chunk. Stop calling when coverage is complete, " +
			"then emit a short plain-text confirmation to end the run.",
		parameters: RecordObservationsSchema,
		execute: async (_id, params: RecordObservationsArgs) => {
			let added = 0;
			let duplicates = 0;
			let rejected = 0;
			for (const obs of params.observations) {
				const sourceEntryIds = normalizeSourceEntryIds(obs.sourceEntryIds, allowedSourceEntryIds);
				if (!sourceEntryIds) {
					rejected++;
					continue;
				}
				const rawContent = obs.content ?? `${obs.event.title}: ${obs.event.details.join("; ")}`;
				const content = truncateRecordContent(rawContent);
				const id = hashId(content);
				if (accumulated.has(id)) {
					duplicates++;
					continue;
				}
				const event = {
					title: truncateRecordContent(obs.event.title),
					details: obs.event.details.map((detail) => truncateRecordContent(detail)),
					...(obs.event.status ? { status: truncateRecordContent(obs.event.status) } : {}),
					...(obs.event.supersedes?.length ? { supersedes: obs.event.supersedes } : {}),
				};
				accumulated.set(id, {
					id,
					content,
					timestamp: obs.timestamp,
					relevance: obs.relevance as Relevance,
					sourceEntryIds,
					tokenCount: estimateStringTokens([content, event.title, ...event.details, event.status ?? ""].join("\n")),
					event,
				});
				added++;
			}
			const rejectedPart = rejected > 0
				? ` ${rejected} observation${rejected === 1 ? "" : "s"} rejected for missing or invalid sourceEntryIds.`
				: "";
			const ack =
				`Recorded ${added} new observation${added === 1 ? "" : "s"} ` +
				(duplicates > 0 ? `(${duplicates} duplicate${duplicates === 1 ? "" : "s"} skipped).` : ".") +
				rejectedPart +
				` Total so far this run: ${accumulated.size}. ` +
				`Continue if the chunk still has uncovered content; otherwise stop calling the tool and emit a short plain-text confirmation.`;
			return { content: [{ type: "text", text: ack }], details: { added, duplicates, rejected, total: accumulated.size } };
		},
	};

	const now = nowTimestamp();
	const userText = `Current local time: ${now}

CURRENT REFLECTIONS:
${joinOrEmpty(priorReflections)}

CURRENT OBSERVATIONS:
${joinOrEmpty(priorObservations)}

Compress the following new conversation chunk into observations by calling record_observations one or more times. Do not restate facts already present in current reflections or current observations. Prefer inline conversation timestamps when assigning times; fall back to the current local time above only if no message timestamp applies. Stop calling the tool and reply with a short plain-text confirmation once the chunk is fully covered.

NEW CONVERSATION CHUNK:
${conversation}`;

	const prompts: Message[] = [
		{
			role: "user",
			content: [{ type: "text", text: userText }],
			timestamp: Date.now(),
		},
	];

	const context: AgentContext = {
		systemPrompt: OBSERVER_SYSTEM,
		messages: [],
		tools: [recordObservations as AgentTool<any>],
	};

	const reasoning = (model as { reasoning?: unknown }).reasoning;
	const thinkingLevel = args.thinkingLevel ?? "low";
	const effectiveMaxTurns = args.maxTurns && args.maxTurns > 0 ? args.maxTurns : undefined;
	let turnCount = 0;
	const config: AgentLoopConfig = {
		model,
		apiKey,
		headers,
		maxTokens: boundedMaxTokens(model, AGENT_LOOP_MAX_TOKENS),
		convertToLlm: (msgs) => msgs as Message[],
		toolExecution: "sequential",
		...(reasoning && thinkingLevel !== "off" ? { reasoning: thinkingLevel } : {}),
		...(effectiveMaxTurns !== undefined
			? {
				shouldStopAfterTurn: () => {
					turnCount++;
					return turnCount >= effectiveMaxTurns;
				},
			}
			: {}),
	};

	const loop = args.agentLoop ?? agentLoop;
	const stream = loop(prompts, context, config, signal);
	for await (const _event of stream) {
		// Drain events; the tool's execute already collects records.
	}
	await stream.result();

	if (accumulated.size === 0) return undefined;
	return Array.from(accumulated.values());
}
