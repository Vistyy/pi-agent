import { agentLoop, type AgentContext, type AgentLoopConfig, type AgentTool } from "@earendil-works/pi-agent-core";
import type { Message, Model, ModelThinkingLevel } from "@earendil-works/pi-ai";
import { AGENT_LOOP_MAX_TOKENS, boundedMaxTokens } from "./model-budget.js";

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
	const stream = loop(prompts, context, config, args.signal);
	for await (const _event of stream) {
		// Tool execution side effects collect outputs.
	}
	await stream.result();
}
