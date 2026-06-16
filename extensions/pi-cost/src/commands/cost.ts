import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { foldCost } from "../fold.js";
import { formatCostDefault, formatCostFull } from "../format.js";

function firstArg(args: unknown): string | undefined {
	if (Array.isArray(args)) return typeof args[0] === "string" ? args[0] : undefined;
	if (typeof args === "string") return args.trim().split(/\s+/)[0] || undefined;
	if (args && typeof args === "object" && "mode" in args) {
		const mode = (args as { mode?: unknown }).mode;
		return typeof mode === "string" ? mode : undefined;
	}
	return undefined;
}

export function registerCostCommand(pi: ExtensionAPI): void {
	pi.registerCommand("cost", {
		description: "Show session cost breakdown",
		handler: async (args, ctx) => {
			const mode = firstArg(args);
			if (mode && mode !== "full") {
				ctx.ui.notify("Usage: /cost [full]", "info");
				return;
			}
			const entries = ctx.sessionManager.getBranch() as Array<{ type?: unknown; customType?: unknown; data?: unknown; message?: unknown }>;
			const cost = foldCost(entries);
			ctx.ui.notify(mode === "full" ? formatCostFull(cost) : formatCostDefault(cost), "info");
		},
	});
}
