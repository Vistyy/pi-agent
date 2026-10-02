import { basename, dirname } from "node:path";
import type { Skill } from "@earendil-works/pi-coding-agent";

export function formatCompactSkills(
	skills: readonly Pick<Skill, "name" | "description" | "filePath" | "disableModelInvocation">[],
	fileReadTool: "read" | "bash",
): string | undefined {
	const visible = skills.filter((skill) => !skill.disableModelInvocation);
	if (visible.length === 0) return undefined;

	for (const skill of visible) {
		if (
			basename(skill.filePath) !== "SKILL.md" ||
			basename(dirname(skill.filePath)) !== skill.name ||
			/[:\r\n]/.test(skill.name) ||
			/[\r\n]/.test(skill.description) ||
			/[\r\n]/.test(skill.filePath)
		) {
			return undefined;
		}
	}

	const lines = [
		"The following skills provide specialized instructions for specific tasks.",
		fileReadTool === "read"
			? "Use the read tool to load a skill's file when the task matches its description."
			: "Use bash to load a skill's file when the task matches its description.",
		"When a skill file references a relative path, resolve it against the skill directory (parent of SKILL.md / dirname of the path) and use that absolute path in tool commands.",
		"",
		"File for each skill: <root>/<name>/SKILL.md.",
	];
	let previousRoot: string | undefined;
	for (const skill of visible) {
		const root = dirname(dirname(skill.filePath));
		if (root !== previousRoot) {
			lines.push("", `Root: ${root}`);
			previousRoot = root;
		}
		lines.push(`${skill.name}: ${skill.description}`);
	}
	return lines.join("\n");
}
