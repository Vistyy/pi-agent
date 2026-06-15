import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { Runtime } from "../runtime.js";
import {
	fullProjection,
	observationToSummaryLine,
	reflectionToSummaryLine,
	contextProjection,
	type Entry,
	type Projection,
} from "../session-ledger/index.js";

function firstArg(args: unknown): string | undefined {
	if (Array.isArray(args)) return typeof args[0] === "string" ? args[0] : undefined;
	if (typeof args === "string") return args.trim().split(/\s+/)[0];
	if (args && typeof args === "object" && "mode" in args) {
		const mode = (args as { mode?: unknown }).mode;
		return typeof mode === "string" ? mode : undefined;
	}
	return undefined;
}

function renderList<T>(items: T[], render: (item: T) => string, empty: string): string {
	return items.length > 0 ? items.map(render).join("\n") : empty;
}

function renderContentOnlyProjection(projection: Projection, emptyScope: "context" | "recorded"): string {
	return [
		"── Reflections ──",
		renderList(projection.reflections, reflectionToSummaryLine, `No ${emptyScope} reflections.`),
		"",
		"── Observations ──",
		renderList(projection.observations, observationToSummaryLine, `No ${emptyScope} observations.`),
	].join("\n");
}

export async function runViewCommand(args: unknown, ctx: any, runtime: Runtime): Promise<void> {
	runtime.ensureConfig(ctx.cwd);
	const entries = ctx.sessionManager.getBranch() as Entry[];
	const mode = firstArg(args);

	const notifyView = (output: string) => ctx.ui.notify(output, "info");

	if (mode === "full") {
		notifyView(renderContentOnlyProjection(fullProjection(entries), "recorded"));
		return;
	}

	if (mode && mode !== "context") {
		ctx.ui.notify("Usage: /om:view [context|full]", "info");
		return;
	}

	notifyView(renderContentOnlyProjection(contextProjection(entries), "context"));
}

export function registerViewCommand(pi: ExtensionAPI, runtime: Runtime): void {
	pi.registerCommand("om:view", {
		description: "Print observational memory context (context by default, full on request)",
		handler: async (args, ctx) => runViewCommand(args, ctx, runtime),
	});
}
