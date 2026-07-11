import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const ENV_KEY = "PI_OPENAI_FAST";
const STATUS_ID = "openai-fast";

export default function openaiFast(pi: ExtensionAPI) {
	let enabled = process.env[ENV_KEY] === "1";

	pi.on("session_start", (_event, ctx) => {
		ctx.ui.setStatus(STATUS_ID, enabled ? ctx.ui.theme.fg("accent", "⚡") : undefined);
	});

	pi.registerCommand("fast", {
		description: "Toggle OpenAI fast mode",
		handler: async (_args, ctx) => {
			enabled = !enabled;
			if (enabled) process.env[ENV_KEY] = "1";
			else delete process.env[ENV_KEY];
			ctx.ui.setStatus(STATUS_ID, enabled ? ctx.ui.theme.fg("accent", "⚡") : undefined);
			ctx.ui.notify(`OpenAI fast mode ${enabled ? "on" : "off"}`, "info");
		},
	});

	pi.on("before_provider_request", (event, ctx) => {
		if (!enabled || !["openai", "openai-codex"].includes(ctx.model?.provider ?? "")) return;

		return {
			...event.payload,
			service_tier: "priority",
		};
	});
}
