type ToolCall = {
	execute: (id: string, params: unknown) => Promise<unknown> | unknown;
};

export type CapturedAgentContext = {
	systemPrompt: string;
	tools: ToolCall[];
};

export type CapturedAgentConfig = {
	reasoning?: unknown;
	shouldStopAfterTurn?: (event: unknown) => boolean;
};

export type CapturedPrompt = {
	content: Array<{ text?: string }>;
};

export type AgentLoopHandler = (
	prompts: CapturedPrompt[],
	context: CapturedAgentContext,
	config: CapturedAgentConfig,
) => Promise<void> | void;

export function fakeAgentLoop(handler: AgentLoopHandler) {
	return ((prompts: CapturedPrompt[], context: CapturedAgentContext, config: CapturedAgentConfig) => ({
		async *[Symbol.asyncIterator]() {
			// No streaming events needed for unit tests.
		},
		result: async () => {
			await handler(prompts, context, config);
			return {};
		},
	})) as never;
}
