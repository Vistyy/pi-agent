import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const DEEPSEEK_V4_FLASH_INSTRUCTIONS = `
- Before repository exploration or edits, read the \`SKILL.md\` file for every advertised skill whose description plausibly applies to the task. A skill description does not replace its full instructions.
- For every \`git commit\`, use one imperative subject line only. Do not add a commit body unless the user explicitly asks.
`;

function isDeepSeekV4Flash(model: { provider: string; id: string } | undefined): boolean {
	return (
		(model?.provider === "deepseek" || model?.provider === "opencode-go") &&
		model.id === "deepseek-v4-flash"
	);
}

export default function modelShims(pi: ExtensionAPI): void {
	pi.on("before_agent_start", (event, ctx) => {
		if (!isDeepSeekV4Flash(ctx.model)) return;

		return {
			systemPrompt: `${event.systemPrompt}\n${DEEPSEEK_V4_FLASH_INSTRUCTIONS}`,
		};
	});
}
