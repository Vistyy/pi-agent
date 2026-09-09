import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import {
	SESSION_NAME_ENTRY,
	decideTabRestore,
	findBranchTabName,
	normalizeSessionNames,
	parseRenameCommand,
} from "./logic.ts";

const NameSessionParams = Type.Object({
	piName: Type.String({
		description: "The descriptive name for the current Pi session.",
		minLength: 1,
	}),
	tabName: Type.Optional(Type.String({
		description: "A distinct compact 2-4 word label for the current Herdr tab; use only inside Herdr.",
		minLength: 1,
	})),
});

type HerdrPane = { tab_id?: unknown };
type HerdrTab = { tab_id?: unknown; label?: unknown; number?: unknown };

type CurrentTab = {
	id: string;
	label: string;
	number: number;
};

function herdrEnabled(): boolean {
	return process.env.HERDR_ENV === "1";
}

function herdrCommand(): string {
	return process.env.HERDR_BIN_PATH?.trim() || "herdr";
}

async function getCurrentTab(pi: ExtensionAPI, signal?: AbortSignal): Promise<CurrentTab> {
	const options = { signal, timeout: 10_000 };
	const paneResult = await pi.exec(herdrCommand(), ["pane", "current", "--current"], options);
	if (paneResult.code !== 0) throw new Error("could not locate the current Herdr pane");

	let pane: HerdrPane | undefined;
	try {
		pane = JSON.parse(paneResult.stdout)?.result?.pane;
	} catch {
		throw new Error("Herdr returned an invalid pane response");
	}
	if (!pane || typeof pane.tab_id !== "string" || !pane.tab_id) {
		throw new Error("could not verify the current Herdr tab identity");
	}

	const result = await pi.exec(herdrCommand(), ["tab", "get", pane.tab_id], options);
	if (result.code !== 0) throw new Error("could not read the current Herdr tab");

	let tab: HerdrTab | undefined;
	try {
		tab = JSON.parse(result.stdout)?.result?.tab;
	} catch {
		throw new Error("Herdr returned an invalid tab response");
	}
	if (!tab || tab.tab_id !== pane.tab_id || typeof tab.label !== "string" ||
		typeof tab.number !== "number" || !Number.isInteger(tab.number) || tab.number < 0) {
		throw new Error("could not verify the current Herdr tab");
	}
	return { id: pane.tab_id, label: tab.label, number: tab.number };
}

async function renameCurrentTab(
	pi: ExtensionAPI,
	tab: CurrentTab,
	name: string,
	signal?: AbortSignal,
): Promise<void> {
	const result = await pi.exec(herdrCommand(), ["tab", "rename", tab.id, name], { signal, timeout: 10_000 });
	if (result.code !== 0) {
		const reason = result.stderr.trim() || result.stdout.trim() || `exit code ${result.code}`;
		throw new Error(`Herdr tab rename failed: ${reason}`);
	}
}

function saveTabAlias(pi: ExtensionAPI, name: string): void {
	pi.appendEntry(SESSION_NAME_ENTRY, { tabName: name });
}

function queueNamingPrompt(pi: ExtensionAPI, ctx: ExtensionContext): void {
	const prompt = herdrEnabled()
		? "Call name_session exactly once after the intended outcome and scope are clear. Provide a descriptive piName and a distinct, compact, discriminative 2-4 word tabName for the current Herdr tab; do not duplicate the Pi name. Only reconsider either name after a material scope or name change."
		: "Call name_session exactly once after the intended outcome and scope are clear, with a descriptive piName only. Only reconsider it after a material scope or name change.";
	pi.sendUserMessage(prompt, ctx.isIdle() ? undefined : { deliverAs: "followUp" });
}

export default function sessionNamingExtension(pi: ExtensionAPI) {
	pi.on("session_start", async (_event, ctx) => {
		if (!herdrEnabled()) return;
		const alias = findBranchTabName(ctx.sessionManager.getBranch());
		if (!alias) return;

		try {
			const tab = await getCurrentTab(pi);
			if (decideTabRestore(tab.label, tab.number, alias) === "restore") {
				await renameCurrentTab(pi, tab, alias);
			}
		} catch {
			// Restoration is best effort and must never prevent the session from starting.
		}
	});

	pi.registerCommand("rename", {
		description: "Queue the normal session naming pass (usage: /rename)",
		handler: async (args, ctx) => {
			const action = parseRenameCommand(args);
			if (action.queue) {
				queueNamingPrompt(pi, ctx);
				return;
			}
			if ("error" in action) ctx.ui.notify(action.error, "error");
		},
	});

	pi.registerTool({
		name: "name_session",
		label: "Name Session",
		description:
			"Set the current Pi session name. Inside Herdr, optionally also rename exactly the current Herdr tab and remember its compact alias for this branch. Outside Herdr, Pi naming works without a tab.",
		promptSnippet: "Name the Pi session and, inside Herdr, its current tab",
		promptGuidelines: [
			"Use name_session once after the intended outcome and scope are clear: provide a descriptive piName, plus a distinct compact/discriminative 2-4 word tabName inside Herdr, or piName only outside Herdr.",
			"Reconsider name_session only after a material scope or name change; do not create routine naming churn.",
		],
		parameters: NameSessionParams,
		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			const names = normalizeSessionNames(params);
			pi.setSessionName(names.piName);

			if (!names.tabName || !herdrEnabled()) {
				return {
					content: [{ type: "text", text: `Pi session named ${JSON.stringify(names.piName)}.` }],
					details: { piName: names.piName },
				};
			}

			try {
				const tab = await getCurrentTab(pi, signal);
				await renameCurrentTab(pi, tab, names.tabName, signal);
				saveTabAlias(pi, names.tabName);
				return {
					content: [{ type: "text", text: `Pi session named ${JSON.stringify(names.piName)} and current Herdr tab named ${JSON.stringify(names.tabName)}.` }],
					details: { piName: names.piName, tabName: names.tabName },
				};
			} catch (error) {
				const reason = error instanceof Error ? error.message : String(error);
				return {
					content: [{ type: "text", text: `Pi session named ${JSON.stringify(names.piName)}; Herdr tab was not renamed: ${reason}.` }],
					details: { piName: names.piName, tabName: names.tabName, herdr: "failed", error: reason },
				};
			}
		},
	});

}
