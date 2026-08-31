import { readFileSync } from "node:fs";

import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import {
	appendLearningReminder,
	appendMentoringContract,
	DEFAULT_LEARNING_MODE,
	LEARNING_MODE_STATE_TYPE,
	parseLearningCommand,
	restoreLearningMode,
} from "./logic.js";

const mentoringContract = readFileSync(new URL("./contract.md", import.meta.url), "utf8").trim();

export default function learningMode(pi: ExtensionAPI): void {
	let enabled = DEFAULT_LEARNING_MODE;

	pi.on("session_start", (_event, ctx) => {
		enabled = restoreLearningMode(ctx.sessionManager.getBranch());
	});

	pi.registerCommand("learning", {
		description: "Show or change learning mode",
		handler: async (args, ctx) => {
			const command = parseLearningCommand(args);
			if (command.action === "invalid") {
				ctx.ui.notify("Usage: /learning [on|off]", "error");
				return;
			}

			if (command.action === "set" && command.enabled !== enabled) {
				enabled = command.enabled;
				pi.appendEntry(LEARNING_MODE_STATE_TYPE, { enabled });
			}

			ctx.ui.notify(`Learning mode is ${enabled ? "on" : "off"}.`, "info");
		},
	});

	pi.on("before_agent_start", (event) => {
		if (!enabled) return;
		return { systemPrompt: appendMentoringContract(event.systemPrompt, mentoringContract) };
	});

	pi.on("context", (event) => {
		if (!enabled) return;
		return { messages: appendLearningReminder(event.messages) as AgentMessage[] };
	});
}
