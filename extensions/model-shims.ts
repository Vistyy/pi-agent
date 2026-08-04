import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const BLOCKING_GATE_INSTRUCTIONS = `
## Blocking verification

- Run every blocking verification command directly. Do not pipe it through \`tail\`, \`head\`, \`grep\`, or another filter that can hide output or replace its exit status.
- If output must be captured, preserve and return the blocking command's original exit status.
`;

const DEEPSEEK_V4_FLASH_INSTRUCTIONS = `
## DeepSeek V4 Flash workflow additions

- Before repository exploration or edits, read the \`SKILL.md\` file for every advertised skill whose description plausibly applies to the task. A skill description does not replace its full instructions.
- For every \`git commit\`, use one imperative subject line only. Do not add a commit body unless the user explicitly asks.
`;

function isDeepSeekV4Flash(model: { provider: string; id: string } | undefined): boolean {
	return model?.provider === "deepseek" && model.id === "deepseek-v4-flash";
}

export default function modelShims(pi: ExtensionAPI): void {
	pi.on("before_agent_start", (event, ctx) => {
		const modelShimInstructions = isDeepSeekV4Flash(ctx.model)
			? `\n${DEEPSEEK_V4_FLASH_INSTRUCTIONS}`
			: "";

		return {
			systemPrompt: `${event.systemPrompt}\n${BLOCKING_GATE_INSTRUCTIONS}${modelShimInstructions}`,
		};
	});
}
