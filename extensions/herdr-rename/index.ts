import { randomUUID } from "node:crypto";

import { StringEnum } from "@earendil-works/pi-ai";
import type { ExecResult, ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import {
	decideAutomaticRename,
	HERDR_RENAME_ENTRY,
	restoreSessionTabState,
	type SessionTabState,
} from "./logic.ts";

const TARGET_ENV = {
	workspace: "HERDR_WORKSPACE_ID",
	tab: "HERDR_TAB_ID",
	pane: "HERDR_PANE_ID",
} as const;

type RenameTarget = keyof typeof TARGET_ENV;

type RenameDetails = {
	target: RenameTarget;
	id: string;
	name?: string;
	skipped?: boolean;
	reason?: string;
};

const RenameParams = Type.Object({
	target: StringEnum(["workspace", "tab", "pane"] as const),
	name: Type.String({ description: "A very concise name: usually 1-2 short words, aiming for 12 characters or fewer to fit the narrow sidebar", minLength: 1 }),
	mode: Type.Optional(StringEnum(["default-tab", "explicit-request"] as const, {
		description: "Defaults to default-tab. Use explicit-request only for a direct user-requested rename.",
	})),
});

type HerdrTab = {
	tab_id?: unknown;
	workspace_id?: unknown;
	label?: unknown;
	number?: unknown;
};

type ValidatedTab = {
	tabId: string;
	workspaceId: string;
	label: string;
};

function getEnvironmentIdentity(target: RenameTarget): { id: string; workspaceId?: string } {
	const idEnvironmentVariable = TARGET_ENV[target];
	const id = process.env[idEnvironmentVariable]?.trim();
	if (!id) {
		throw new Error(
			`Cannot rename current Herdr ${target}: ${idEnvironmentVariable} is not available.`,
		);
	}

	if (target !== "tab") return { id };
	return { id, workspaceId: process.env.HERDR_WORKSPACE_ID?.trim() };
}

async function getCurrentTab(
	pi: ExtensionAPI,
	command: string,
	tabId: string,
	workspaceId: string,
	signal: AbortSignal | undefined,
): Promise<ValidatedTab> {
	const info = await pi.exec(command, ["tab", "get", tabId], { signal, timeout: 10_000 });
	if (info.code !== 0) {
		throw new Error("Cannot check the current tab name; no rename attempted.");
	}

	let tab: HerdrTab;
	try {
		tab = JSON.parse(info.stdout)?.result?.tab;
	} catch {
		throw new Error("Invalid Herdr tab response; no rename attempted.");
	}
	if (!tab || tab.tab_id !== tabId || tab.workspace_id !== workspaceId ||
		typeof tab.label !== "string" || typeof tab.number !== "number" || !Number.isInteger(tab.number)) {
		throw new Error("Cannot verify the current tab identity and name; no rename attempted.");
	}

	return { tabId, workspaceId, label: tab.label };
}

function getSessionId(ctx: ExtensionContext): string | undefined {
	try {
		const sessionId = ctx.sessionManager.getSessionId();
		return typeof sessionId === "string" && sessionId.length > 0 ? sessionId : undefined;
	} catch {
		return undefined;
	}
}

function appendBaseline(pi: ExtensionAPI, sessionId: string, runId: string, tab: ValidatedTab): void {
	pi.appendEntry(HERDR_RENAME_ENTRY, {
		kind: "baseline",
		sessionId,
		runId,
		tabId: tab.tabId,
		workspaceId: tab.workspaceId,
		label: tab.label,
	});
}

function appendRenameMarker(pi: ExtensionAPI, sessionId: string | undefined, runId: string | undefined, tabId: string): void {
	if (!sessionId || !runId) return;
	pi.appendEntry(HERDR_RENAME_ENTRY, { kind: "renamed", sessionId, runId, tabId });
}

export default function herdrRenameExtension(pi: ExtensionAPI) {
	let sessionId: string | undefined;
	let tabId: string | undefined;
	let sessionState: SessionTabState = { renamed: false };
	let baselineReady: Promise<void> = Promise.resolve();

	async function captureSessionBaseline(ctx: ExtensionContext, reason: "startup" | "reload" | "new" | "resume" | "fork"): Promise<void> {
		sessionState = { renamed: false };
		sessionId = getSessionId(ctx);
		tabId = undefined;

		if (process.env.HERDR_ENV !== "1" || !sessionId) return;

		const identity = getEnvironmentIdentity("tab");
		const currentTabId = identity.id;
		if (!identity.workspaceId) return;
		const workspaceId = identity.workspaceId;
		const command = process.env.HERDR_BIN_PATH?.trim() || "herdr";
		const currentTab = await getCurrentTab(pi, command, currentTabId, workspaceId, undefined);
		tabId = currentTab.tabId;

		if (reason === "reload") {
			sessionState = restoreSessionTabState(
				ctx.sessionManager.getEntries(),
				sessionId,
				currentTab.tabId,
				currentTab.workspaceId,
			);
			return;
		}

		const runId = randomUUID();
		sessionState.baseline = {
			sessionId,
			runId,
			tabId: currentTab.tabId,
			workspaceId: currentTab.workspaceId,
			label: currentTab.label,
		};
		appendBaseline(pi, sessionId, runId, currentTab);
	}

	pi.on("session_start", async (event, ctx) => {
		baselineReady = captureSessionBaseline(ctx, event.reason).catch(() => {
			// Automatic naming remains unavailable when the startup identity check fails.
			sessionState = { renamed: false };
			tabId = undefined;
		});
		await baselineReady;
	});

	pi.registerTool<typeof RenameParams, RenameDetails>({
		name: "herdr_rename",
		label: "Rename Herdr Resource",
		description:
			"Rename the current Herdr resource. Automatic mode is limited to the current tab and can replace its session-start label only while that label remains unchanged. Use explicit-request mode only for a direct user-requested rename, including workspaces and panes. Cannot target other Herdr resources.",
		promptSnippet: "After understanding the central task, give the current Herdr tab a concise distinguishing title, or perform a requested resource rename",
		promptGuidelines: [
			"Use herdr_rename only after determining the conversation's central task from the request and any needed inspection; do not rename at the beginning merely from the opening wording.",
			"In automatic default-tab mode, herdr_rename may rename only the current tab and only if its label is unchanged from this Pi session's start. Choose a concise distinguishing topic in your own words, usually 1-2 short words and around 12 characters or fewer; do not copy the opening phrase, use a generic title, or repeat routine follow-up renames.",
			"Use explicit-request mode only under direct human authority. Preserve exact names requested by the user; workspace and pane renames always require that mode. Do not use explicit-request mode to bypass an automatic rename decision.",
		],
		executionMode: "sequential",
		parameters: RenameParams,
		async execute(_toolCallId, params, signal) {
			if (process.env.HERDR_ENV !== "1") {
				throw new Error("Cannot rename Herdr resource: this Pi session is not running inside Herdr.");
			}

			const name = params.name.trim();
			if (!name) {
				throw new Error("Cannot rename Herdr resource: name must not be empty or whitespace.");
			}

			const target = params.target as RenameTarget;
			const identity = getEnvironmentIdentity(target);
			const id = identity.id;
			const command = process.env.HERDR_BIN_PATH?.trim() || "herdr";

			await baselineReady;
			if (params.mode !== "explicit-request") {
				if (target !== "tab") {
					throw new Error("Automatic naming is limited to tabs; workspace and pane renames require an explicit user request.");
				}
				if (!sessionId || !tabId || tabId !== id || !identity.workspaceId) {
					return {
						content: [{ type: "text", text: "Kept current tab name; the session-start tab identity could not be verified. Do not retry in explicit-request mode without a user request." }],
						details: { target, id, skipped: true, reason: "baseline-unavailable" },
					};
				}

				const currentTab = await getCurrentTab(pi, command, id, identity.workspaceId, signal);
				const decision = decideAutomaticRename(sessionState, currentTab.label, name);
				if (decision !== "rename") {
					const message = decision === "already-renamed"
						? `Kept current tab name ${JSON.stringify(currentTab.label)}; this Pi session already renamed it.`
						: decision === "label-changed"
							? `Kept current tab name ${JSON.stringify(currentTab.label)}; it changed after this Pi session started.`
							: decision === "same-name"
								? `Kept current tab name ${JSON.stringify(currentTab.label)}; no rename needed.`
								: "Kept current tab name; the session-start baseline is unavailable.";
					return {
						content: [{ type: "text", text: `${message} Do not retry in explicit-request mode without a user request.` }],
						details: { target, id, name: currentTab.label, skipped: true, reason: decision },
					};
				}
			}

			let result: ExecResult;
			try {
				result = await pi.exec(command, [target, "rename", id, name], { signal, timeout: 10_000 });
			} catch (error) {
				const reason = error instanceof Error ? error.message : String(error);
				throw new Error(`Failed to run Herdr rename command: ${reason}`);
			}
			if (result.code !== 0) {
				const reason = result.stderr.trim() || result.stdout.trim() || `exit code ${result.code}`;
				throw new Error(`Failed to rename current Herdr ${target}: ${reason}`);
			}

			if (target === "tab") {
				sessionState.renamed = true;
				appendRenameMarker(pi, sessionId, sessionState.baseline?.runId, id);
			}
			return {
				content: [{ type: "text", text: `Renamed current Herdr ${target} to ${JSON.stringify(name)}.` }],
				details: { target, id, name },
			};
		},
	});
}
