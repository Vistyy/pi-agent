import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const DEEPSEEK_V4_FLASH_INSTRUCTIONS = `
- Before repository exploration or edits, read the \`SKILL.md\` file for every advertised skill whose description plausibly applies to the task. A skill description does not replace its full instructions.
- For every \`git commit\`, use one imperative subject line only. Do not add a commit body unless the user explicitly asks.
`;

const MUSE_SPARK_INSTRUCTIONS = `
- Keep code comments to a minimum. Prefer clear code; add comments only for non-obvious intent, constraints, or behavior. Do not narrate what the code already says. Preserve useful existing comments, required notices, and tooling directives; do not perform unrelated comment cleanup.
`;

function isDeepSeekV4Flash(model: { provider: string; id: string } | undefined): boolean {
	return (
		(model?.provider === "deepseek" || model?.provider === "opencode-go") &&
		model.id === "deepseek-v4-flash"
	);
}

function isMuseSpark(model: { provider: string; id: string } | undefined): boolean {
	return model !== undefined && /^(?:meta\/)?muse-spark(?:$|[-:])/.test(model.id);
}

export default function modelShims(pi: ExtensionAPI): void {
	pi.on("before_agent_start", (event, ctx) => {
		const extras: string[] = [];
		if (isDeepSeekV4Flash(ctx.model)) extras.push(DEEPSEEK_V4_FLASH_INSTRUCTIONS);
		if (isMuseSpark(ctx.model)) extras.push(MUSE_SPARK_INSTRUCTIONS);
		if (extras.length === 0) return;

		return {
			systemPrompt: `${event.systemPrompt}\n${extras.join("\n")}`,
		};
	});
}
