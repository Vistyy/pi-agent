import { agentLoop, type AgentContext, type AgentLoopConfig, type AgentTool } from "@earendil-works/pi-agent-core";
import { streamSimple, type Message, type Model, type ModelThinkingLevel } from "@earendil-works/pi-ai";
import { AGENT_LOOP_MAX_TOKENS, boundedMaxTokens } from "./model-budget.js";
import { debugLog } from "../debug-log.js";
import { estimateStringTokens } from "../memory/token-estimate.js";

export type MemoryAgentName = "observer" | "reflector" | "curator";

export type MemoryAgentUsage = {
	agent: MemoryAgentName | undefined;
	requestIndex?: number;
	model?: { provider?: string; id?: string };
	thinkingLevel?: ModelThinkingLevel;
	durationMs?: number;
	stopReason?: string;
	usage: unknown;
};

export type MemoryAgentLoopArgs = {
	model: Model<any>;
	apiKey: string;
	headers?: Record<string, string>;
	signal?: AbortSignal;
	agentLoop?: typeof agentLoop;
	maxTurns?: number;
	thinkingLevel?: ModelThinkingLevel;
	systemPrompt: string;
	userText: string;
	tools: AgentTool<any>[];
	agentName?: MemoryAgentName;
	onUsage?: (usage: MemoryAgentUsage) => void;
	onAssistantText?: (text: string) => void;
};

export function joinOrEmpty(items: readonly string[]): string {
	return items.length ? items.join("\n") : "(none yet)";
}

export function normalizeAllowedIdsStrict(
	ids: readonly string[] | undefined,
	allowedIds: readonly string[],
): string[] | undefined {
	if (!ids || ids.length === 0) return undefined;
	const allowedOrder = new Map<string, number>();
	for (let i = 0; i < allowedIds.length; i++) {
		if (!allowedOrder.has(allowedIds[i])) allowedOrder.set(allowedIds[i], i);
	}

	const seen = new Set<string>();
	for (const id of ids) {
		if (!allowedOrder.has(id)) return undefined;
		seen.add(id);
	}
	if (seen.size === 0) return undefined;
	return Array.from(seen).sort((a, b) => (allowedOrder.get(a) ?? 0) - (allowedOrder.get(b) ?? 0));
}

function estimateJsonTokens(value: unknown): number {
	try {
		return estimateStringTokens(JSON.stringify(value));
	} catch {
		return 0;
	}
}

export async function runMemoryAgentLoop(args: MemoryAgentLoopArgs): Promise<void> {
	const prompts: Message[] = [{ role: "user", content: [{ type: "text", text: args.userText }], timestamp: Date.now() }];
	const context: AgentContext = { systemPrompt: args.systemPrompt, messages: [], tools: args.tools };
	const reasoning = (args.model as { reasoning?: unknown }).reasoning;
	const thinkingLevel = args.thinkingLevel ?? "low";
	const effectiveMaxTurns = args.maxTurns && args.maxTurns > 0 ? args.maxTurns : undefined;
	let turnCount = 0;
	const config: AgentLoopConfig = {
		model: args.model,
		apiKey: args.apiKey,
		headers: args.headers,
		maxTokens: boundedMaxTokens(args.model, AGENT_LOOP_MAX_TOKENS),
		convertToLlm: (msgs) => msgs as Message[],
		toolExecution: "sequential",
		...(reasoning && thinkingLevel !== "off" ? { reasoning: thinkingLevel } : {}),
		...(effectiveMaxTurns !== undefined ? { shouldStopAfterTurn: () => ++turnCount >= effectiveMaxTurns } : {}),
	};

	const loop = args.agentLoop ?? agentLoop;
	let providerRequestCount = 0;
	const streamFn = async (model: Model<any>, llmContext: unknown, options?: Parameters<typeof streamSimple>[2]) => {
		providerRequestCount++;
		const requestStarted = Date.now();
		const context = llmContext as { systemPrompt?: string; messages?: unknown[]; tools?: unknown[] };
		debugLog("memory_agent.provider_request", {
			agent: args.agentName,
			requestIndex: providerRequestCount,
			systemPromptTokenEstimate: estimateStringTokens(context.systemPrompt ?? ""),
			messagesTokenEstimate: estimateJsonTokens(context.messages ?? []),
			toolsTokenEstimate: estimateJsonTokens(context.tools ?? []),
			messageCount: context.messages?.length ?? 0,
			toolCount: context.tools?.length ?? 0,
		});
		const stream = streamSimple(model, llmContext as Parameters<typeof streamSimple>[1], options);
		const originalResult = stream.result.bind(stream);
		stream.result = async () => {
			const result = await originalResult();
			const usage = (result as { usage?: unknown }).usage;
			const stopReason = (result as { stopReason?: unknown }).stopReason;
			const durationMs = Date.now() - requestStarted;
			if (usage) args.onUsage?.({
				agent: args.agentName,
				requestIndex: providerRequestCount,
				model: { provider: (model as { provider?: string }).provider, id: (model as { id?: string }).id },
				thinkingLevel,
				durationMs,
				stopReason: typeof stopReason === "string" ? stopReason : undefined,
				usage,
			});
			debugLog("memory_agent.provider_result", {
				agent: args.agentName,
				requestIndex: providerRequestCount,
				durationMs,
				usage,
				stopReason,
			});
			return result;
		};
		return stream;
	};
	const started = Date.now();
	debugLog("memory_agent.start", {
		agent: args.agentName,
		thinkingLevel,
		maxTurns: effectiveMaxTurns,
		toolCount: args.tools.length,
		userTextLength: args.userText.length,
	});
	try {
		const stream = loop(prompts, context, config, args.signal, streamFn);
		for await (const _event of stream) {
			// Tool execution side effects collect outputs.
		}
		const result = await stream.result();
		if (args.onAssistantText) {
			for (const message of result as Array<{ role?: string; content?: Array<{ type?: string; text?: string }> }>) {
				if (message.role !== "assistant") continue;
				const text = (message.content ?? []).filter((item) => item.type === "text" && typeof item.text === "string").map((item) => item.text).join("\n").trim();
				if (text) args.onAssistantText(text);
			}
		}
		debugLog("memory_agent.end", {
			agent: args.agentName,
			durationMs: Date.now() - started,
			usage: (result as { usage?: unknown }).usage,
			providerRequestCount,
		});
	} catch (error) {
		debugLog("memory_agent.error", {
			agent: args.agentName,
			durationMs: Date.now() - started,
			errorMessage: error instanceof Error ? error.message : String(error),
		});
		throw error;
	}
}
