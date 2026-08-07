import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

const ENV_KEY = "PI_OPENAI_FAST";
const STATUS_ID = "openai-fast";
const FAST_PROVIDERS = new Set(["openai", "openai-codex"]);

export default function openaiFast(pi: ExtensionAPI) {
	let enabled = process.env[ENV_KEY] !== "0";

	pi.on("session_start", (_event, ctx) => {
		setStatus(ctx, enabled);
	});

	pi.on("model_select", (event, ctx) => {
		setStatus(ctx, enabled, event.model);
	});

	pi.registerCommand("fast", {
		description: "Toggle OpenAI fast mode",
		handler: async (_args, ctx) => {
			enabled = !enabled;
			if (enabled) process.env[ENV_KEY] = "1";
			else delete process.env[ENV_KEY];
			setStatus(ctx, enabled);
			ctx.ui.notify(`OpenAI fast mode ${enabled ? "on" : "off"}`, "info");
		},
	});

	pi.on("session_shutdown", (_event, ctx) => {
		if (ctx.hasUI) ctx.ui.setStatus(STATUS_ID, undefined);
	});

	pi.on("before_provider_request", (event, ctx) => {
		if (!enabled || !isFastModel(ctx.model)) return;

		const payload = event.payload && typeof event.payload === "object" ? event.payload : {};
		return {
			...payload,
			service_tier: "priority",
		};
	});
}

function setStatus(ctx: ExtensionContext, enabled: boolean, model = ctx.model): void {
	if (!ctx.hasUI) return;
	const status = enabled && isFastModel(model) ? ctx.ui.theme.fg("accent", "⚡") : undefined;
	ctx.ui.setStatus(STATUS_ID, status);
}

function isFastModel(model: ExtensionContext["model"]): boolean {
	return model != null && FAST_PROVIDERS.has(model.provider);
}
