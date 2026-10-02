import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { formatCompactSkills } from "./catalog.js";

export default function compactSkills(pi: ExtensionAPI): void {
	pi.on("before_agent_start", (event) => {
		const options = event.systemPromptOptions;
		delete options.sections.skills;
		const fileReadTool = options.selectedTools.includes("read")
			? "read"
			: options.selectedTools.includes("bash")
				? "bash"
				: undefined;
		if (!fileReadTool) return;

		const catalog = formatCompactSkills(options.skills, fileReadTool);
		if (catalog !== undefined) options.sections.skills = catalog;
	});
}
