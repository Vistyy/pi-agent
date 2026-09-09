import { randomUUID } from "node:crypto";

import { StringEnum } from "@earendil-works/pi-ai";
import type { ExecResult, ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import {
	applyPiRename,
	decideAutomaticTabRename,
	RESOURCE_RENAME_ENTRY,
	restoreSessionResourceState,
	dispatchRenameCommand,
	type HerdrRenameTarget,
	type RenameRequest,
	type RenameTarget,
	type SessionResourceState,
	validateRenameRequest,
} from "./logic.ts";

const HERDR_TARGETS = {
	workspace: { environmentVariable: "HERDR_WORKSPACE_ID", cliTarget: "workspace" },
	tab: { environmentVariable: "HERDR_TAB_ID", cliTarget: "tab" },
	pane: { environmentVariable: "HERDR_PANE_ID", cliTarget: "pane" },
} as const;

const RenameParams = Type.Object({
	piName: Type.Optional(Type.String({
		description: "A brief but contextual name for the current Pi resource; Pi persists it as the session display name.",
		minLength: 1,
	})),
	herdr: Type.Optional(Type.Object({
		target: StringEnum(["workspace", "tab", "pane"] as const, {
			description: "Exactly one current Herdr target.",
		}),
		name: Type.String({ description: "The requested Herdr resource name.", minLength: 1 }),
	})),
	mode: Type.Optional(StringEnum(["automatic", "explicit-request"] as const, {
		description: "Defaults to automatic. Use explicit-request only for a direct user-requested rename.",
	})),
});

type TargetResult = {
	target: RenameTarget;
	status: "renamed" | "skipped" | "failed";
	id?: string;
	name?: string;
	reason?: string;
	error?: string;
};

type RenameDetails = {
	mode: "automatic" | "explicit-request";
	targets: TargetResult[];
};

type HerdrTab = {
	tab_id?: unknown;
	workspace_id?: unknown;
	label?: unknown;
};

type ValidatedTab = {
	tabId: string;
	workspaceId: string;
	label: string;
};

function getEnvironmentIdentity(target: HerdrRenameTarget): { id: string; workspaceId?: string } {
	const { environmentVariable } = HERDR_TARGETS[target];
	const id = process.env[environmentVariable]?.trim();
	if (!id) {
		throw new Error(`${environmentVariable} is not available for the current Herdr ${target}.`);
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
		throw new Error("Cannot check the current Herdr tab name; no rename attempted.");
	}

	let tab: HerdrTab;
	try {
		tab = JSON.parse(info.stdout)?.result?.tab;
	} catch {
		throw new Error("Invalid Herdr tab response; no rename attempted.");
	}
	if (!tab || tab.tab_id !== tabId || tab.workspace_id !== workspaceId ||
		typeof tab.label !== "string") {
		throw new Error("Cannot verify the current Herdr tab identity and name; no rename attempted.");
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
	pi.appendEntry(RESOURCE_RENAME_ENTRY, {
		kind: "baseline",
		sessionId,
		runId,
		tabId: tab.tabId,
		workspaceId: tab.workspaceId,
		label: tab.label,
	});
}

function appendAutomaticPiName(pi: ExtensionAPI, sessionId: string | undefined, name: string): void {
	if (!sessionId) return;
	pi.appendEntry(RESOURCE_RENAME_ENTRY, {
		kind: "automatic-name",
		sessionId,
		target: "pi",
		name,
	});
}

function appendAutomaticTabName(
	pi: ExtensionAPI,
	sessionId: string | undefined,
	state: SessionResourceState,
	name: string,
): void {
	if (!sessionId || !state.baseline) return;
	pi.appendEntry(RESOURCE_RENAME_ENTRY, {
		kind: "automatic-name",
		sessionId,
		target: "tab",
		runId: state.baseline.runId,
		tabId: state.baseline.tabId,
		workspaceId: state.baseline.workspaceId,
		name,
	});
}

function errorResult(target: RenameTarget, error: unknown): TargetResult {
	return {
		target,
		status: "failed",
		error: error instanceof Error ? error.message : String(error),
	};
}

function nameResult(target: RenameTarget, id: string | undefined, name: string): TargetResult {
	return { target, status: "renamed", id, name };
}

function skipResult(
	target: RenameTarget,
	reason: string,
	name?: string,
	id?: string,
): TargetResult {
	return { target, status: "skipped", reason, name, id };
}

function formatTargetResult(result: TargetResult): string {
	if (result.status === "renamed") {
		return `Renamed current ${result.target} to ${JSON.stringify(result.name)}.`;
	}
	if (result.status === "failed") {
		return `Could not rename current ${result.target}: ${result.error}`;
	}
	const reason = result.reason === "same-name"
		? "the requested name is already current"
		: result.reason === "live-name-changed"
			? "its live name was not initially empty or last set automatically by this extension"
			: result.reason === "label-changed"
			? "its live label changed after the verified occupancy baseline"
			: result.reason === "baseline-unavailable"
			? "the verified occupancy baseline is unavailable"
			: result.reason ?? "automatic naming is not applicable";
	return `Kept current ${result.target} name${result.name === undefined ? "" : ` ${JSON.stringify(result.name)}`}: ${reason}. Do not retry with explicit-request without a direct user request.`;
}

function formatExecutionResult(result: { targets: TargetResult[] }): string {
	return result.targets.map(formatTargetResult).join(" ");
}

export default function resourceRenameExtension(pi: ExtensionAPI) {
	let sessionId: string | undefined;
	let currentTabId: string | undefined;
	let sessionState: SessionResourceState = {};
	let baselineReady: Promise<void> = Promise.resolve();

	async function captureSessionState(
		ctx: ExtensionContext,
		reason: "startup" | "reload" | "new" | "resume" | "fork",
	): Promise<void> {
		sessionId = getSessionId(ctx);
		currentTabId = undefined;
		const restored = sessionId
			? restoreSessionResourceState(ctx.sessionManager.getEntries(), sessionId)
			: {};
		sessionState = { lastAutomaticPiName: restored.lastAutomaticPiName };

		if (process.env.HERDR_ENV !== "1" || !sessionId) return;

		try {
			const identity = getEnvironmentIdentity("tab");
			if (!identity.workspaceId) return;
			const command = process.env.HERDR_BIN_PATH?.trim() || "herdr";
			const currentTab = await getCurrentTab(pi, command, identity.id, identity.workspaceId, undefined);
			currentTabId = currentTab.tabId;

			if (reason === "reload") {
				const current = restoreSessionResourceState(
					ctx.sessionManager.getEntries(),
					sessionId,
					currentTab.tabId,
					currentTab.workspaceId,
				);
				// Pi state is independent of Herdr and must survive even if the
				// migration has no generic tab baseline to restore.
				sessionState = {
					baseline: current.baseline,
					lastAutomaticTabName: current.lastAutomaticTabName,
					lastAutomaticPiName: restored.lastAutomaticPiName,
				};
				return;
			}

			const runId = randomUUID();
			sessionState = {
				lastAutomaticPiName: restored.lastAutomaticPiName,
				baseline: {
					sessionId,
					runId,
					tabId: currentTab.tabId,
					workspaceId: currentTab.workspaceId,
					label: currentTab.label,
				},
			};
			appendBaseline(pi, sessionId, runId, currentTab);
		} catch {
			// Keep the Pi state usable, but make automatic tab naming fail closed.
			currentTabId = undefined;
			sessionState = { lastAutomaticPiName: restored.lastAutomaticPiName };
		}
	}

	async function executePiName(
		request: { name: string; explicit: boolean },
	): Promise<TargetResult> {
		try {
			const result = applyPiRename(
				{
					getSessionName: () => pi.getSessionName(),
					setSessionName: (name) => pi.setSessionName(name),
				},
				request.name,
				request.explicit,
				sessionState.lastAutomaticPiName,
			);
			const currentName = pi.getSessionName();
			if (request.explicit || result.decision === "rename") {
				if (!request.explicit) {
					sessionState.lastAutomaticPiName = request.name;
					appendAutomaticPiName(pi, sessionId, request.name);
				}
				return nameResult("pi", undefined, request.name);
			}

			if (result.decision === "same-name") {
				return skipResult("pi", "same-name", currentName ?? request.name);
			}
			return skipResult("pi", "live-name-changed", currentName);
		} catch (error) {
			return errorResult("pi", error);
		}
	}

	async function executeHerdrName(
		request: { target: HerdrRenameTarget; name: string; explicit: boolean },
		signal: AbortSignal | undefined,
	): Promise<TargetResult> {
		const target = request.target;
		try {
			if (process.env.HERDR_ENV !== "1") {
				return errorResult(target, `this Pi process is not running inside Herdr`);
			}

			const identity = getEnvironmentIdentity(target);
			const id = identity.id;
			const command = process.env.HERDR_BIN_PATH?.trim() || "herdr";

			if (!request.explicit) {
				await baselineReady;
				if (!sessionId || !currentTabId || currentTabId !== id || !identity.workspaceId ||
					!sessionState.baseline || sessionState.baseline.workspaceId !== identity.workspaceId) {
					return skipResult(target, "baseline-unavailable", undefined, id);
				}

				const currentTab = await getCurrentTab(pi, command, id, identity.workspaceId, signal);
				const decision = decideAutomaticTabRename(sessionState, currentTab.label, request.name);
				if (decision !== "rename") {
					return skipResult(target, decision, currentTab.label, id);
				}
			}

			let result: ExecResult;
			try {
				result = await pi.exec(command, [HERDR_TARGETS[target].cliTarget, "rename", id, request.name], {
					signal,
					timeout: 10_000,
				});
			} catch (error) {
				throw new Error(`failed to run Herdr rename command: ${error instanceof Error ? error.message : String(error)}`);
			}
			if (result.code !== 0) {
				const reason = result.stderr.trim() || result.stdout.trim() || `exit code ${result.code}`;
				throw new Error(`Herdr rename failed: ${reason}`);
			}

			if (!request.explicit && target === "tab") {
				sessionState.lastAutomaticTabName = request.name;
				appendAutomaticTabName(pi, sessionId, sessionState, request.name);
			}
			return nameResult(target, id, request.name);
		} catch (error) {
			return errorResult(target, error);
		}
	}

	async function executeRenameRequest(
		input: RenameRequest,
		signal: AbortSignal | undefined,
	): Promise<RenameDetails> {
		const validation = validateRenameRequest(input, process.env.HERDR_ENV === "1");
		if (!validation.valid) throw new Error(validation.error);

		const request = validation.request;
		const targets: TargetResult[] = [];
		if (request.piName !== undefined) {
			targets.push(await executePiName({ name: request.piName, explicit: request.mode === "explicit-request" }));
		}
		if (request.herdr) {
			targets.push(await executeHerdrName({
				target: request.herdr.target,
				name: request.herdr.name,
				explicit: request.mode === "explicit-request",
			}, signal));
		}
		return { mode: request.mode, targets };
	}

	function queueRenamePrompt(target: "both" | RenameTarget, ctx: ExtensionContext): void {
		const insideHerdr = process.env.HERDR_ENV === "1";
		let prompt: string;
		if (target === "both") {
			prompt = insideHerdr
				? "The user asked for the normal resource naming pass. After any needed clarification or inspection, wait until the intended outcome and scope are reasonably clear, then call rename_resource once in automatic mode with both piName (brief but contextual) and herdr:{target:'tab',name:...} (a distinct compact 1-2 word label). These names must not merely duplicate each other. Reconsider them only after a material scope change or if they are materially inaccurate; do not create routine churn."
				: "The user asked for the normal resource naming pass. After any needed clarification or inspection, wait until the intended outcome and scope are reasonably clear, then call rename_resource in automatic mode with piName only, using a brief but contextual Pi name. Reconsider it only after a material scope change or if it is materially inaccurate; do not create routine churn.";
		} else {
			const targetDescription = target === "pi"
				? "the current Pi resource, using piName"
				: `the current Herdr ${target} resource, using herdr:{target:'${target}',name:...}`;
			prompt = `The user directly authorized renaming ${targetDescription}. Choose an appropriate name from the conversation and call rename_resource exactly once with mode explicit-request and only that target. Do not rename any other resource.`;
		}

		if (ctx.isIdle()) {
			pi.sendUserMessage(prompt);
		} else {
			pi.sendUserMessage(prompt, { deliverAs: "followUp" });
		}
	}

	pi.on("session_start", async (event, ctx) => {
		baselineReady = captureSessionState(ctx, event.reason);
		await baselineReady;
	});

	pi.registerCommand("rename", {
		description: "Name the current Pi/Herdr resources or perform a direct rename",
		handler: async (args, ctx) => {
			await dispatchRenameCommand(args, {
				onError: (message) => ctx.ui.notify(message, "error"),
				onQueue: (target) => queueRenamePrompt(target, ctx),
				onDirect: async (target, name) => {
					const request: RenameRequest = target === "pi"
						? { piName: name, mode: "explicit-request" }
						: { herdr: { target, name }, mode: "explicit-request" };
					try {
						const result = await executeRenameRequest(request, undefined);
						for (const targetResult of result.targets) {
							ctx.ui.notify(formatTargetResult(targetResult), targetResult.status === "failed" ? "error" : "info");
						}
					} catch (error) {
						ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
					}
				},
			});
		},
	});

	pi.registerTool<typeof RenameParams, RenameDetails>({
		name: "rename_resource",
		label: "Rename Resource",
		description:
			"Rename the current Pi resource and/or exactly one current Herdr resource. Use optional piName and optional herdr:{target:'workspace'|'tab'|'pane',name}; mode defaults to automatic. Automatic naming inside Herdr requires both piName and a tab target in one call; outside Herdr it requires piName only. Use explicit-request only for a direct user-requested rename.",
		promptSnippet: "After scope is clear, name Pi contextually and Herdr tabs compactly, or honor a direct rename request",
		promptGuidelines: [
			"Use rename_resource only after needed clarification or inspection makes the intended outcome and scope reasonably clear; delay initial automatic naming rather than guessing from opening wording.",
			"For the normal automatic pass, rename_resource uses piName alone outside Herdr, and uses both piName and herdr:{target:'tab',name:...} inside Herdr. The Pi name should carry more context; the Herdr tab label should be a distinct compact 1-2 word label. Do not use workspace or pane in automatic mode.",
			"Use automatic refinement in rename_resource only after a material scope change or material inaccuracy. It is allowed only when each live name is initially unset or still exactly the last automatic name recorded by this extension; independently skip a user-changed or otherwise different live name, and reject routine churn.",
			"Use rename_resource with mode explicit-request only under direct human authority. A direct request may contain piName, one Herdr target, or both; never invent a batch or use explicit-request to bypass an automatic skip. Preserve direct wording subject to normal trimming.",
		],
		executionMode: "sequential",
		parameters: RenameParams,
		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			const result = await executeRenameRequest(params, signal);
			return {
				content: [{ type: "text", text: formatExecutionResult(result) }],
				details: result,
			};
		},
	});
}
