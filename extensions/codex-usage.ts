import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

const PROVIDER = "openai-codex";
const STATUS_ID = "codex-usage";
const USAGE_URL = "https://chatgpt.com/backend-api/wham/usage";
const TTL_MS = 5 * 60 * 1000;
const TIMEOUT_MS = 15_000;

type PiModel = NonNullable<ExtensionContext["model"]>;
type Window = { usedPercent: number };
type Snapshot = { id: string; name?: string; primary?: Window; secondary?: Window };
type Report = { capturedAt: number; snapshots: Snapshot[] };

type BackendPayload = {
	rate_limit?: unknown;
	additional_rate_limits?: unknown;
};

type BackendRateLimit = {
	primary_window?: unknown;
	secondary_window?: unknown;
};

type BackendWindow = {
	used_percent?: unknown;
};

type BackendAdditionalLimit = {
	limit_name?: unknown;
	metered_feature?: unknown;
	rate_limit?: unknown;
};

let cache: { createdAt: number; report: Report } | undefined;
let refreshTimer: ReturnType<typeof setTimeout> | undefined;
let requestId = 0;

export default function (pi: ExtensionAPI) {
	async function refresh(ctx: ExtensionContext, force = false, model = ctx.model): Promise<void> {
		if (!isCodexModel(model)) {
			clearStatus(ctx);
			return;
		}

		const id = ++requestId;
		if (!force && cache && Date.now() - cache.createdAt < TTL_MS) {
			setStatus(ctx, cache.report, model);
			return;
		}

		ctx.ui.setStatus(STATUS_ID, ctx.ui.theme.fg("dim", "Codex checking"));
		try {
			const report = await fetchUsage(ctx);
			if (id !== requestId || !isCodexModel(ctx.model)) return;
			cache = { createdAt: Date.now(), report };
			setStatus(ctx, report, model);
		} catch (error) {
			if (id !== requestId) return;
			ctx.ui.setStatus(STATUS_ID, ctx.ui.theme.fg("warning", "Codex usage error"));
		}
	}

	pi.on("session_start", (_event, ctx) => void refresh(ctx));
	pi.on("model_select", (event, ctx) => void refresh(ctx, false, event.model));
	pi.on("session_tree", (_event, ctx) => void refresh(ctx));
	pi.on("session_shutdown", (_event, ctx) => clearStatus(ctx));

	pi.registerCommand("codex-usage", {
		description: "Refresh Codex ChatGPT subscription usage status",
		handler: async (args, ctx) => {
			if (args.trim() === "--clear") {
				clearStatus(ctx);
				ctx.ui.notify("Codex usage status cleared", "info");
				return;
			}
			try {
				await refresh(ctx, args.includes("--refresh"));
				ctx.ui.notify(cache ? formatDetails(cache.report, ctx.model) : "No Codex usage loaded", "info");
			} catch (error) {
				ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
			}
		},
	});
}

function setStatus(ctx: ExtensionContext, report: Report, model: PiModel | undefined): void {
	ctx.ui.setStatus(STATUS_ID, ctx.ui.theme.fg("accent", formatStatus(report, model)));
	if (refreshTimer) clearTimeout(refreshTimer);
	refreshTimer = setTimeout(() => {
		// Timer keeps status fresh while this extension instance is alive.
		// Uses latest ctx/model available from this render cycle.
		void (async () => {
			if (isCodexModel(ctx.model)) {
				try {
					const fresh = await fetchUsage(ctx);
					cache = { createdAt: Date.now(), report: fresh };
					setStatus(ctx, fresh, ctx.model);
				} catch {
					ctx.ui.setStatus(STATUS_ID, ctx.ui.theme.fg("warning", "Codex usage error"));
				}
			}
		})();
	}, TTL_MS);
	refreshTimer.unref?.();
}

function clearStatus(ctx: ExtensionContext): void {
	requestId++;
	if (refreshTimer) clearTimeout(refreshTimer);
	refreshTimer = undefined;
	ctx.ui.setStatus(STATUS_ID, undefined);
}

function formatStatus(report: Report, model: PiModel | undefined): string {
	const snapshot = selectSnapshot(report, model);
	if (!snapshot) return "Codex usage unavailable";
	const fiveHour = snapshot.primary ? remaining(snapshot.primary) : "?";
	const sevenDay = snapshot.secondary ? remaining(snapshot.secondary) : "?";
	return `Codex 5H ${fiveHour}% 7D ${sevenDay}%`;
}

function formatDetails(report: Report, model: PiModel | undefined): string {
	return `${formatStatus(report, model)}\nSource: ${USAGE_URL}`;
}

function remaining(window: Window): string {
	return String(Math.round(100 - clamp(window.usedPercent)));
}

function selectSnapshot(report: Report, model: PiModel | undefined): Snapshot | undefined {
	const primary = report.snapshots.find((s) => normalize(s.id) === "codex" || normalize(s.name) === "codex");
	if (!model) return primary ?? report.snapshots[0];

	const modelKeys = [model.id, model.name].map(normalize).filter(Boolean) as string[];
	const exact = report.snapshots.find((snapshot) => {
		const keys = [snapshot.id, snapshot.name].map(normalize).filter(Boolean) as string[];
		return keys.some((key) => modelKeys.includes(key));
	});
	return exact ?? primary ?? report.snapshots[0];
}

async function fetchUsage(ctx: ExtensionContext): Promise<Report> {
	const auth = await resolveAuth(ctx);
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
	try {
		const response = await fetch(USAGE_URL, { headers: auth, signal: controller.signal });
		const text = await response.text();
		if (!response.ok) throw new Error(`Codex usage returned HTTP ${response.status}: ${redact(text)}`);
		return normalizePayload(JSON.parse(text) as BackendPayload);
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

function normalizePayload(payload: BackendPayload): Report {
	const snapshots: Snapshot[] = [];
	const base = normalizeLimit("codex", undefined, payload.rate_limit);
	if (base) snapshots.push(base);

	const additional = Array.isArray(payload.additional_rate_limits) ? payload.additional_rate_limits : [];
	for (const raw of additional) {
		if (!isObject(raw)) continue;
		const item = raw as BackendAdditionalLimit;
		const id = asString(item.metered_feature) ?? asString(item.limit_name);
		if (!id) continue;
		const snapshot = normalizeLimit(id, asString(item.limit_name), item.rate_limit);
		if (snapshot) snapshots.push(snapshot);
	}

	if (snapshots.length === 0) throw new Error("Codex usage returned no rate-limit windows.");
	return { capturedAt: Date.now(), snapshots };
}

function normalizeLimit(id: string, name: string | undefined, raw: unknown): Snapshot | undefined {
	if (!isObject(raw)) return undefined;
	const limit = raw as BackendRateLimit;
	const primary = normalizeWindow(limit.primary_window);
	const secondary = normalizeWindow(limit.secondary_window);
	if (!primary && !secondary) return undefined;
	return { id, name, primary, secondary };
}

function normalizeWindow(raw: unknown): Window | undefined {
	if (!isObject(raw)) return undefined;
	const usedPercent = asNumber((raw as BackendWindow).used_percent);
	return usedPercent === undefined ? undefined : { usedPercent };
}

function isCodexModel(model: Pick<PiModel, "provider"> | undefined): model is PiModel {
	return model?.provider === PROVIDER;
}

function normalize(value: string | undefined): string | undefined {
	return value?.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || undefined;
}

function hasHeader(headers: Record<string, string>, name: string): boolean {
	return Object.keys(headers).some((key) => key.toLowerCase() === name.toLowerCase());
}

function isObject(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === "object" && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
	return typeof value === "string" ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value === "string" && value.trim()) {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : undefined;
	}
	return undefined;
}

function clamp(value: number): number {
	if (!Number.isFinite(value)) return 0;
	return Math.min(100, Math.max(0, value));
}

function redact(text: string): string {
	return text
		.replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer <redacted>")
		.replace(/"access_token"\s*:\s*"[^"]+"/gi, '"access_token":"<redacted>"')
		.slice(0, 600);
}
