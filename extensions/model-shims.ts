import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const DEEPSEEK_V4_FLASH_INSTRUCTIONS = `
- Before repository exploration or edits, read the \`SKILL.md\` file for every advertised skill whose description plausibly applies to the task. A skill description does not replace its full instructions.
- For every \`git commit\`, use one imperative subject line only. Do not add a commit body unless the user explicitly asks.
`;

const MUSE_SPARK_INSTRUCTIONS = `
- Give the smallest complete answer that lets the user continue the conversation quickly. Lead with the verdict and its central caveat in one or two sentences, then add only the context needed to understand, decide, or act. Stop when the answer is complete.
- Answer the user's exact question first at the user's abstraction level. Do not introduce surrounding systems, examples, or future work unless necessary to answer the exact question. If more depth or a full report might help, ask before expanding.
- Use compact simple language in flowing complete sentences. Keep canonical terms and preserve exact names, paths, commands, and constraints, but add a brief plain explanation only for a new or unfamiliar term. Shortness comes from removing low-value content, not clipping prose or dropping articles. Avoid staccato fragments, filler, pleasantries, hedging, and repetition.
- Preserve conditions, causes, contrasts, and consequences when simplifying.
`;

function isDeepSeekV4Flash(model: { provider: string; id: string } | undefined): boolean {
	return (
		(model?.provider === "deepseek" || model?.provider === "opencode-go") &&
		model.id === "deepseek-v4-flash"
	);
}

function isMuseSpark(model: { provider: string; id: string } | undefined): boolean {
	return model?.provider === "meta" && model.id.startsWith("muse-spark");
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
