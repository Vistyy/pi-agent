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
			"Rename the current Herdr workspace, tab, or pane to an explicitly supplied name. This tool does not choose or generate names automatically and cannot target other Herdr resources.",
		promptSnippet: "Rename the current Herdr workspace, tab, or pane to an explicitly supplied name",
		parameters: Type.Object({
			target: StringEnum(["workspace", "tab", "pane"] as const),
			name: Type.String({ description: "The new name", minLength: 1 }),
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
