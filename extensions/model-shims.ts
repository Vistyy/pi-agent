import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const DEEPSEEK_V4_FLASH_INSTRUCTIONS = `
- A blocking verification command is a repository-supported quality gate or a task-required test, lint, typecheck, check, build, or lifecycle gate whose successful exit status is required before you can report the implementation complete. Treat a command as blocking when the repository instructions, task, or user makes its result a completion criterion.
- Exploratory, diagnostic, search, status, diff, and advisory-report commands are not blocking unless an authority explicitly makes their result a completion criterion.
- Before adding a pipeline, determine whether the command's exit status could determine whether you report the work complete. If it could, run that command as its own unpiped bash invocation. Do not use \`| tail\`, \`| head\`, \`| grep\`, \`tee\`, redirection, command substitution, or another wrapper that can hide output or replace its exit status.
- Do not add \`| tail\` merely to reduce a blocking command's output. The bash tool truncates displayed output while preserving the command exit status.
- If output must be captured, preserve and return the blocking command's original exit status.
- Before repository exploration or edits, read the \`SKILL.md\` file for every advertised skill whose description plausibly applies to the task. A skill description does not replace its full instructions.
- For every \`git commit\`, use one imperative subject line only. Do not add a commit body unless the user explicitly asks.
`;

function isDeepSeekV4Flash(model: { provider: string; id: string } | undefined): boolean {
	return model?.provider === "deepseek" && model.id === "deepseek-v4-flash";
}

export default function modelShims(pi: ExtensionAPI): void {
	pi.on("before_agent_start", (event, ctx) => {
		if (!isDeepSeekV4Flash(ctx.model)) return;

		return {
			systemPrompt: `${event.systemPrompt}\n${DEEPSEEK_V4_FLASH_INSTRUCTIONS}`,
		};
	});
}
