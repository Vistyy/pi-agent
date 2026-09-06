import { StringEnum } from "@earendil-works/pi-ai";
import type { ExecResult, ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

const TARGET_ENV = {
	workspace: "HERDR_WORKSPACE_ID",
	tab: "HERDR_TAB_ID",
	pane: "HERDR_PANE_ID",
} as const;

type RenameTarget = keyof typeof TARGET_ENV;

export default function herdrRenameExtension(pi: ExtensionAPI) {
	pi.registerTool({
		name: "herdr_rename",
		label: "Rename Herdr Resource",
		description:
			"Rename the current Herdr resource. By default, only a tab whose label still equals its tab number can be renamed; existing names are preserved. Use explicit-request mode only for a user-requested rename, including workspaces and panes. Cannot target other Herdr resources.",
		promptSnippet: "Give the current Herdr tab a useful task title, or perform a requested resource rename",
		promptGuidelines: [
			"Once the conversation's purpose is clear, use herdr_rename in default mode to give the current default-named tab a short, task-specific title without asking. Choose a very concise title (usually 1-2 short words, aiming for 12 characters or fewer) because the agent sidebar is narrow. Prefer the distinguishing topic; omit filler and redundant workspace context. Preserve an exact name explicitly supplied by the user.",
			"With herdr_rename, preserve existing descriptive names and do not rename for routine follow-ups or retry a skipped automatic rename. Use explicit-request mode only when the user requests a rename; workspaces and panes require such a request.",
		],
		parameters: Type.Object({
			target: StringEnum(["workspace", "tab", "pane"] as const),
			name: Type.String({ description: "A very concise name: usually 1-2 short words, aiming for 12 characters or fewer to fit the narrow sidebar", minLength: 1 }),
			mode: Type.Optional(StringEnum(["default-tab", "explicit-request"] as const, {
				description: "Defaults to default-tab, which preserves non-default names. explicit-request is only for a rename requested by the user.",
			})),
		}),
		async execute(_toolCallId, params, signal) {
			if (process.env.HERDR_ENV !== "1") {
				throw new Error("Cannot rename Herdr resource: this Pi session is not running inside Herdr.");
			}

			const name = params.name.trim();
			if (!name) {
				throw new Error("Cannot rename Herdr resource: name must not be empty or whitespace.");
			}

			const target = params.target as RenameTarget;
			const idEnvironmentVariable = TARGET_ENV[target];
			const id = process.env[idEnvironmentVariable]?.trim();
			if (!id) {
				throw new Error(
					`Cannot rename current Herdr ${target}: ${idEnvironmentVariable} is not available.`,
				);
			}

			const command = process.env.HERDR_BIN_PATH?.trim() || "herdr";
			if (params.mode !== "explicit-request") {
				if (target !== "tab") {
					throw new Error("Automatic naming is limited to tabs; workspace and pane renames require an explicit user request.");
				}
				const info = await pi.exec(command, ["tab", "get", id], { signal, timeout: 10_000 });
				if (info.code !== 0) {
					throw new Error("Cannot check the current tab name; no rename attempted.");
				}
				let tab: { tab_id?: unknown; workspace_id?: unknown; label?: unknown; number?: unknown };
				try {
					tab = JSON.parse(info.stdout)?.result?.tab;
				} catch {
					throw new Error("Invalid Herdr tab response; no rename attempted.");
				}
				if (!tab || tab.tab_id !== id || tab.workspace_id !== process.env.HERDR_WORKSPACE_ID ||
					typeof tab.label !== "string" || typeof tab.number !== "number" || !Number.isInteger(tab.number)) {
					throw new Error("Cannot verify the current tab identity and name; no rename attempted.");
				}
				// Herdr exposes no default/custom flag, so a numeric label is our conservative heuristic.
				if (tab.label !== String(tab.number) || name === tab.label) {
					return {
						content: [{ type: "text", text: `Kept current tab name ${JSON.stringify(tab.label)}; no rename needed. Do not retry in explicit-request mode without a user request.` }],
						details: { target, id, name: tab.label, skipped: true },
					};
				}
			}

			const args = [target, "rename", id, name];
			let result: ExecResult;
			try {
				result = await pi.exec(command, args, { signal, timeout: 10_000 });
			} catch (error) {
				const reason = error instanceof Error ? error.message : String(error);
				throw new Error(`Failed to run Herdr rename command: ${reason}`);
			}
			if (result.code !== 0) {
				const reason = result.stderr.trim() || result.stdout.trim() || `exit code ${result.code}`;
				throw new Error(`Failed to rename current Herdr ${target}: ${reason}`);
			}

			return {
				content: [{ type: "text", text: `Renamed current Herdr ${target} to ${JSON.stringify(name)}.` }],
				details: { target, id, name },
			};
		},
	});
}
