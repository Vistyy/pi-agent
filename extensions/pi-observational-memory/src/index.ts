import { Type } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { registerCompactionHook } from "./hooks/compaction-hook.js";
import { registerMemoryUpdateHook } from "./memory-update/scheduler.js";
import { Runtime } from "./runtime.js";

export default function observationalMemory(pi: ExtensionAPI) {
	const runtime = new Runtime();

	registerMemoryUpdateHook(pi, runtime);
	registerCompactionHook(pi, runtime);

	registerLazyStatusCommand(pi, runtime);
	registerLazyViewCommand(pi, runtime);
	registerLazyRecallTool(pi);
}

function registerLazyStatusCommand(pi: ExtensionAPI, runtime: Runtime): void {
	pi.registerCommand("om:status", {
		description: "Show observational memory status",
		handler: async (args, ctx) => {
			const { runStatusCommand } = await import("./commands/status.js");
			return runStatusCommand(args, ctx, runtime);
		},
	});
}

function registerLazyViewCommand(pi: ExtensionAPI, runtime: Runtime): void {
	pi.registerCommand("om:view", {
		description: "Print observational memory context (context by default, full for recorded memory)",
		handler: async (args, ctx) => {
			const { runViewCommand } = await import("./commands/view.js");
			return runViewCommand(args, ctx, runtime);
		},
	});
}

function registerLazyRecallTool(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "recall",
		label: "Recall memory evidence",
		description:
			"Recover exact evidence and source context behind a compacted observational-memory observation or reflection id on the current branch. " +
			"Use when compressed memory is important and original source context is needed before acting.",
		promptSnippet: "Use recall(<id>) to recover exact source context behind compacted memory observations/reflections when precision matters.",
		promptGuidelines: [
			"Use recall before making an important decision that depends on a compacted observation or reflection id whose details are unclear.",
			"Use recall when you need exact wording, rationale, file paths, commands, errors, commits, user constraints, or provenance behind a remembered claim.",
			"Use recall when a broad reflection is relevant but you need its supporting observations or raw sources to continue safely.",
			"Use recall when the user asks why you believe something, what supports a memory, or what was decided earlier.",
			"Do not use recall as semantic search or transcript browsing; you must already have a specific 12-character memory id.",
			"Do not recall every id preemptively. Recall only when exact source context will materially improve the next action.",
		],
		executionMode: "parallel",
		parameters: Type.Object({
			id: Type.String({
				pattern: "^[a-f0-9]{12}$",
				description: "12-character lowercase hex observation or reflection id shown in compacted memory, /om:view, or a previous recall result. Must be a specific id; this tool does not search by topic.",
			}),
		}),
		renderCall(args) {
			return new Text(`recall ${args.id}`, 0, 0);
		},
		renderResult(result) {
			const text = Array.isArray(result?.content)
				? result.content.filter((part: any) => part?.type === "text").map((part: any) => part.text).join("\n")
				: "";
			return new Text(text ? `\n${text}` : "", 0, 0);
		},
		async execute(toolCallId, params, signal, onUpdate, ctx) {
			const { recallObservationTool } = await import("./tools/recall-observation.js");
			return recallObservationTool.execute(toolCallId, params, signal, onUpdate, ctx);
		},
	});
}
