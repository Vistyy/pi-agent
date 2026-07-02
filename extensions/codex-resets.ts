import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

const PROVIDER = "openai-codex";
const RESET_URL = "https://chatgpt.com/backend-api/wham/rate-limit-reset-credits";
const TIMEOUT_MS = 15_000;

type PiModel = NonNullable<ExtensionContext["model"]>;

type ResetPayload = {
	available_count?: unknown;
	credits?: unknown;
};

type Credit = {
	status?: unknown;
	expires_at?: unknown;
};

export default function codexResetsExtension(pi: ExtensionAPI) {
	pi.registerCommand("codex-resets", {
		description: "Check Codex usage reset credits",
		handler: async (_args, ctx) => {
			try {
				const report = await fetchResetCredits(ctx);
				ctx.ui.notify(formatReport(report), "info");
			} catch (error) {
				ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
			}
		},
	});
}

async function fetchResetCredits(ctx: ExtensionContext): Promise<ResetPayload> {
	const auth = await resolveAuth(ctx);
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

	try {
		const response = await fetch(RESET_URL, {
			headers: {
				...auth,
				originator: "Codex Desktop",
				"OAI-Product-Sku": "CODEX",
				Accept: "application/json",
			},
			signal: controller.signal,
		});

		const text = await response.text();
		if (!response.ok) {
			throw new Error(`Codex reset credits returned HTTP ${response.status}: ${redact(text)}`);
		}

		return JSON.parse(text) as ResetPayload;
	} finally {
		clearTimeout(timeout);
	}
}

async function resolveAuth(ctx: ExtensionContext): Promise<Record<string, string>> {
	const candidates = codexModels(ctx);
	for (const model of candidates) {
		const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
		if (!auth.ok) continue;
		const headers: Record<string, string> = { ...(auth.headers ?? {}) };
		if (!hasHeader(headers, "Authorization") && auth.apiKey) headers.Authorization = `Bearer ${auth.apiKey}`;
		if (!hasHeader(headers, "User-Agent")) headers["User-Agent"] = "pi-codex-usage-simple";
		if (hasHeader(headers, "Authorization")) return headers;
	}
	throw new Error("No Pi openai-codex subscription auth found. Switch to a Codex model or run /login.");
}

function codexModels(ctx: ExtensionContext): PiModel[] {
	const out: PiModel[] = [];
	const seen = new Set<string>();
	const add = (model: PiModel | undefined) => {
		if (!isCodexModel(model)) return;
		const key = `${model.provider}/${model.id}`;
		if (seen.has(key)) return;
		seen.add(key);
		out.push(model);
	};
	add(ctx.model);
	for (const model of ctx.modelRegistry.getAvailable()) add(model);
	for (const model of ctx.modelRegistry.getAll()) add(model);
	return out;
}

function isCodexModel(model: Pick<PiModel, "provider"> | undefined): model is PiModel {
	return model?.provider === PROVIDER;
}

function hasHeader(headers: Record<string, string>, name: string): boolean {
	return Object.keys(headers).some((key) => key.toLowerCase() === name.toLowerCase());
}

function formatReport(payload: ResetPayload): string {
	const count = asNumber(payload.available_count);
	const countText = count === undefined ? formatValue(payload.available_count) : String(count);
	const lines = [`Available Codex reset credits: ${countText}`];
	const availableCredits = Array.isArray(payload.credits)
		? payload.credits.filter((credit): credit is Credit => isAvailableCredit(credit))
		: [];

	if (availableCredits.length === 0) {
		lines.push("No available reset credit expirations found.");
		return lines.join("\n");
	}

	lines.push("", "Available credits expire:");
	for (const credit of availableCredits) {
		lines.push(`- ${formatExpiresAt(credit.expires_at)}`);
	}

	return lines.join("\n");
}

function isAvailableCredit(value: unknown): value is Credit {
	if (!value || typeof value !== "object" || Array.isArray(value)) return false;
	const credit = value as Credit;
	return typeof credit.status === "string" && credit.status.toLowerCase() === "available";
}

function asNumber(value: unknown): number | undefined {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value === "string" && value.trim()) {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : undefined;
	}
	return undefined;
}

function formatExpiresAt(value: unknown): string {
	if (typeof value !== "string" && typeof value !== "number") return formatValue(value);
	const date = new Date(value);
	if (!Number.isFinite(date.getTime())) return formatValue(value);
	return `${date.toLocaleString(undefined, {
		year: "numeric",
		month: "short",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		timeZoneName: "short",
	})} (${formatRelative(date.getTime() - Date.now())})`;
}

function formatRelative(ms: number): string {
	if (ms <= 0) return "expired";
	const totalMinutes = Math.ceil(ms / 60_000);
	const days = Math.floor(totalMinutes / 1_440);
	const hours = Math.floor((totalMinutes % 1_440) / 60);
	const minutes = totalMinutes % 60;
	const parts: string[] = [];
	if (days) parts.push(`${days}d`);
	if (hours) parts.push(`${hours}h`);
	if (!days && minutes) parts.push(`${minutes}m`);
	return parts.length > 0 ? `in ${parts.join(" ")}` : "soon";
}

function formatValue(value: unknown): string {
	if (value === undefined || value === null) return "unknown";
	if (typeof value === "string") return value;
	return JSON.stringify(value);
}

function redact(text: string): string {
	return text
		.replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer <redacted>")
		.replace(/"access_token"\s*:\s*"[^"]+"/gi, '"access_token":"<redacted>"')
		.slice(0, 600);
}
