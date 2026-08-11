import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

const CODEX_PROVIDER = "openai-codex";
const CODEX_STATUS_ID = "quota-codex";
const CODEX_USAGE_URL = "https://chatgpt.com/backend-api/wham/usage";
const OPENCODE_GO_PROVIDER = "opencode-go";
const OPENCODE_GO_USAGE_URL = "https://opencode.ai/zen/go/v1/usage";
const TTL_MS = 5 * 60 * 1000;
const TIMEOUT_MS = 15_000;

type PiModel = NonNullable<ExtensionContext["model"]>;
type Window = { usedPercent: number; resetAt?: number };
type CodexSnapshot = { id: string; name?: string; primary?: Window; secondary?: Window };
type CodexReport = { capturedAt: number; snapshots: CodexSnapshot[] };
type GoReport = {
	rolling?: Window;
	weekly?: Window;
	monthly?: Window;
};
type GoPayload = {
	usage?: {
		rolling?: GoWindow;
		weekly?: GoWindow;
		monthly?: GoWindow;
	};
};

type GoWindow = {
	percent?: unknown;
	resetsAt?: unknown;
};

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
	reset_at?: unknown;
	resets_at?: unknown;
	reset_time?: unknown;
	end_time?: unknown;
	ends_at?: unknown;
	resets_after_seconds?: unknown;
	reset_after_seconds?: unknown;
	seconds_until_reset?: unknown;
};

type BackendAdditionalLimit = {
	limit_name?: unknown;
	metered_feature?: unknown;
	rate_limit?: unknown;
};

let codexCache: { createdAt: number; report: CodexReport } | undefined;
let goCache: { createdAt: number; report: GoReport } | undefined;
let refreshTimer: ReturnType<typeof setTimeout> | undefined;
let requestId = 0;

export default function quotaUsageExtension(pi: ExtensionAPI) {
	async function refreshCodexStatus(ctx: ExtensionContext, force = false, model = ctx.model): Promise<void> {
		if (!ctx.hasUI) return;
		if (!isCodexModel(model)) {
			clearCodexStatus(ctx);
			return;
		}

		const id = ++requestId;
		if (!force && codexCache && Date.now() - codexCache.createdAt < TTL_MS) {
			setCodexStatus(ctx, codexCache.report, model);
			return;
		}

		ctx.ui.setStatus(CODEX_STATUS_ID, ctx.ui.theme.fg("dim", "Codex checking"));
		try {
			const report = await loadCodexReport(ctx, true);
			if (id !== requestId || !isCodexModel(ctx.model)) return;
			setCodexStatus(ctx, report, model);
		} catch {
			if (id !== requestId) return;
			ctx.ui.setStatus(CODEX_STATUS_ID, ctx.ui.theme.fg("warning", "Codex usage error"));
		}
	}

	pi.on("session_start", (_event, ctx) => void refreshCodexStatus(ctx));
	pi.on("model_select", (event, ctx) => void refreshCodexStatus(ctx, false, event.model));
	pi.on("session_tree", (_event, ctx) => void refreshCodexStatus(ctx));
	pi.on("session_shutdown", (_event, ctx) => clearCodexStatus(ctx));

	pi.registerCommand("usage", {
		description: "Show Codex and OpenCode Go subscription quota usage",
		handler: async (args, ctx) => {
			const normalizedArgs = args.trim();
			if (normalizedArgs && normalizedArgs !== "--refresh") {
				ctx.ui.notify("Usage: /usage [--refresh]", "error");
				return;
			}

			const force = normalizedArgs === "--refresh";
			const goApiKey = await ctx.modelRegistry.getApiKeyForProvider(OPENCODE_GO_PROVIDER);
			const [codexResult, goResult] = await Promise.allSettled([
				loadCodexReport(ctx, force),
				goApiKey ? loadGoReport(goApiKey, force) : Promise.resolve(undefined),
			]);

			ctx.ui.notify(formatUsageReport(codexResult, goResult, goApiKey, ctx.model), "info");
		},
	});
}

async function loadCodexReport(ctx: ExtensionContext, force: boolean): Promise<CodexReport> {
	if (!force && codexCache && Date.now() - codexCache.createdAt < TTL_MS) return codexCache.report;
	const report = await fetchCodexUsage(ctx);
	codexCache = { createdAt: Date.now(), report };
	return report;
}

async function loadGoReport(apiKey: string, force: boolean): Promise<GoReport> {
	if (!force && goCache && Date.now() - goCache.createdAt < TTL_MS) return goCache.report;
	const report = await fetchGoUsage(apiKey);
	goCache = { createdAt: Date.now(), report };
	return report;
}

function setCodexStatus(ctx: ExtensionContext, report: CodexReport, model: PiModel | undefined): void {
	ctx.ui.setStatus(CODEX_STATUS_ID, ctx.ui.theme.fg("accent", formatCodexStatus(report, model)));
	if (refreshTimer) clearTimeout(refreshTimer);
	refreshTimer = setTimeout(() => {
		void (async () => {
			if (!isCodexModel(ctx.model)) return;
			try {
				const fresh = await loadCodexReport(ctx, true);
				setCodexStatus(ctx, fresh, ctx.model);
			} catch {
				ctx.ui.setStatus(CODEX_STATUS_ID, ctx.ui.theme.fg("warning", "Codex usage error"));
			}
		})();
	}, TTL_MS);
	refreshTimer.unref?.();
}

function clearCodexStatus(ctx: ExtensionContext): void {
	if (!ctx.hasUI) return;
	requestId++;
	if (refreshTimer) clearTimeout(refreshTimer);
	refreshTimer = undefined;
	ctx.ui.setStatus(CODEX_STATUS_ID, undefined);
}

function formatUsageReport(
	codexResult: PromiseSettledResult<CodexReport>,
	goResult: PromiseSettledResult<GoReport | undefined>,
	goApiKey: string | undefined,
	model: PiModel | undefined,
): string {
	const lines = ["Quota usage", ""];

	if (codexResult.status === "fulfilled") {
		lines.push("Codex", formatCodexDetails(codexResult.value, model), "");
	} else {
		lines.push("Codex", `Unavailable: ${formatError(codexResult.reason)}`, "");
	}

	if (!goApiKey) {
		lines.push(
			"OpenCode Go",
			"Not configured for quota lookup.",
			"Configure the opencode-go provider in Pi, then run /usage --refresh.",
		);
	} else if (goResult.status === "fulfilled" && goResult.value) {
		lines.push("OpenCode Go", formatGoDetails(goResult.value));
	} else if (goResult.status === "rejected") {
		lines.push("OpenCode Go", `Unavailable: ${formatError(goResult.reason)}`);
	} else {
		lines.push("OpenCode Go", "Unavailable.");
	}

	return lines.join("\n");
}

function formatCodexStatus(report: CodexReport, model: PiModel | undefined): string {
	const snapshot = selectCodexSnapshot(report, model);
	if (!snapshot) return "Codex usage unavailable";
	const fiveHour = snapshot.primary ? remaining(snapshot.primary) : "?";
	const sevenDay = snapshot.secondary ? remaining(snapshot.secondary) : "?";
	return `Codex 5H ${fiveHour}% 7D ${sevenDay}%`;
}

function formatCodexDetails(report: CodexReport, model: PiModel | undefined): string {
	const snapshot = selectCodexSnapshot(report, model);
	if (!snapshot) return `${formatCodexStatus(report, model)}\nSource: ${CODEX_USAGE_URL}`;
	return [
		formatCodexStatus(report, model),
		`5H reset: ${formatReset(snapshot.primary)}`,
		`7D reset: ${formatReset(snapshot.secondary)}`,
		`Source: ${CODEX_USAGE_URL}`,
	].join("\n");
}

function formatGoDetails(report: GoReport): string {
	return [
		formatGoWindow("Rolling", report.rolling),
		formatGoWindow("Weekly", report.weekly),
		formatGoWindow("Monthly", report.monthly),
		`Source: ${OPENCODE_GO_USAGE_URL}`,
	].join("\n");
}

function formatGoWindow(label: string, window: Window | undefined): string {
	if (!window) return `${label}: unavailable`;
	return `${label}: ${Math.round(clamp(window.usedPercent))}% used, resets ${formatReset(window)}`;
}

function remaining(window: Window): string {
	return String(Math.round(100 - clamp(window.usedPercent)));
}

function formatReset(window: Window | undefined): string {
	if (!window?.resetAt) return "unknown";
	const deltaMs = window.resetAt - Date.now();
	return `${formatDuration(deltaMs)} (${formatDate(window.resetAt)})`;
}

function formatDuration(ms: number): string {
	if (ms <= 0) return "now";
	const totalMinutes = Math.ceil(ms / 60_000);
	const days = Math.floor(totalMinutes / 1_440);
	const hours = Math.floor((totalMinutes % 1_440) / 60);
	const minutes = totalMinutes % 60;
	const parts: string[] = [];
	if (days) parts.push(`${days}d`);
	if (hours) parts.push(`${hours}h`);
	if (minutes || parts.length === 0) parts.push(`${minutes}m`);
	return parts.join(" ");
}

function formatDate(ms: number): string {
	return new Date(ms).toLocaleString(undefined, {
		year: "numeric",
		month: "short",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
	});
}

function selectCodexSnapshot(report: CodexReport, model: PiModel | undefined): CodexSnapshot | undefined {
	const primary = report.snapshots.find((s) => normalize(s.id) === "codex" || normalize(s.name) === "codex");
	if (!model) return primary ?? report.snapshots[0];

	const modelKeys = [model.id, model.name].map(normalize).filter(Boolean) as string[];
	const exact = report.snapshots.find((snapshot) => {
		const keys = [snapshot.id, snapshot.name].map(normalize).filter(Boolean) as string[];
		return keys.some((key) => modelKeys.includes(key));
	});
	return exact ?? primary ?? report.snapshots[0];
}

async function fetchGoUsage(apiKey: string): Promise<GoReport> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
	try {
		const response = await fetch(OPENCODE_GO_USAGE_URL, {
			headers: {
				Accept: "application/json",
				Authorization: `Bearer ${apiKey}`,
			},
			signal: controller.signal,
		});
		const text = await response.text();
		if (!response.ok) {
			throw new Error(`OpenCode Go usage returned HTTP ${response.status}: ${redact(text)}`);
		}
		return normalizeGoPayload(JSON.parse(text) as GoPayload);
	} finally {
		clearTimeout(timeout);
	}
}

function normalizeGoPayload(payload: GoPayload): GoReport {
	const rolling = normalizeGoWindow(payload.usage?.rolling);
	const weekly = normalizeGoWindow(payload.usage?.weekly);
	const monthly = normalizeGoWindow(payload.usage?.monthly);
	if (!rolling && !weekly && !monthly) {
		throw new Error("OpenCode Go usage returned no quota windows.");
	}
	return { rolling, weekly, monthly };
}

function normalizeGoWindow(window: GoWindow | undefined): Window | undefined {
	const usedPercent = asNumber(window?.percent);
	if (usedPercent === undefined) return undefined;
	return { usedPercent, resetAt: asTimestampMs(window?.resetsAt) };
}

async function fetchCodexUsage(ctx: ExtensionContext): Promise<CodexReport> {
	const auth = await resolveCodexAuth(ctx);
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
	try {
		const response = await fetch(CODEX_USAGE_URL, { headers: auth, signal: controller.signal });
		const text = await response.text();
		if (!response.ok) throw new Error(`Codex usage returned HTTP ${response.status}: ${redact(text)}`);
		return normalizeCodexPayload(JSON.parse(text) as BackendPayload);
	} finally {
		clearTimeout(timeout);
	}
}

async function resolveCodexAuth(ctx: ExtensionContext): Promise<Record<string, string>> {
	for (const model of codexModels(ctx)) {
		const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
		if (!auth.ok) continue;
		const headers: Record<string, string> = { ...(auth.headers ?? {}) };
		if (!hasHeader(headers, "Authorization") && auth.apiKey) headers.Authorization = `Bearer ${auth.apiKey}`;
		if (!hasHeader(headers, "User-Agent")) headers["User-Agent"] = "pi-quota-usage";
		if (hasHeader(headers, "Authorization")) return headers;
	}
	throw new Error("No Pi openai-codex subscription auth found. Run /login or configure Codex in Pi.");
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

function normalizeCodexPayload(payload: BackendPayload): CodexReport {
	const snapshots: CodexSnapshot[] = [];
	const base = normalizeCodexLimit("codex", undefined, payload.rate_limit);
	if (base) snapshots.push(base);

	const additional = Array.isArray(payload.additional_rate_limits) ? payload.additional_rate_limits : [];
	for (const raw of additional) {
		if (!isObject(raw)) continue;
		const item = raw as BackendAdditionalLimit;
		const id = asString(item.metered_feature) ?? asString(item.limit_name);
		if (!id) continue;
		const snapshot = normalizeCodexLimit(id, asString(item.limit_name), item.rate_limit);
		if (snapshot) snapshots.push(snapshot);
	}

	if (snapshots.length === 0) throw new Error("Codex usage returned no rate-limit windows.");
	return { capturedAt: Date.now(), snapshots };
}

function normalizeCodexLimit(id: string, name: string | undefined, raw: unknown): CodexSnapshot | undefined {
	if (!isObject(raw)) return undefined;
	const limit = raw as BackendRateLimit;
	const primary = normalizeCodexWindow(limit.primary_window);
	const secondary = normalizeCodexWindow(limit.secondary_window);
	if (!primary && !secondary) return undefined;
	return { id, name, primary, secondary };
}

function normalizeCodexWindow(raw: unknown): Window | undefined {
	if (!isObject(raw)) return undefined;
	const window = raw as BackendWindow;
	const usedPercent = asNumber(window.used_percent);
	if (usedPercent === undefined) return undefined;
	return { usedPercent, resetAt: resolveResetAt(window) };
}

function resolveResetAt(window: BackendWindow): number | undefined {
	const absolute =
		asTimestampMs(window.reset_at) ??
		asTimestampMs(window.resets_at) ??
		asTimestampMs(window.reset_time) ??
		asTimestampMs(window.end_time) ??
		asTimestampMs(window.ends_at);
	if (absolute !== undefined) return absolute;

	const seconds =
		asNumber(window.resets_after_seconds) ??
		asNumber(window.reset_after_seconds) ??
		asNumber(window.seconds_until_reset);
	return seconds === undefined ? undefined : Date.now() + seconds * 1000;
}

function isCodexModel(model: Pick<PiModel, "provider"> | undefined): model is PiModel {
	return model?.provider === CODEX_PROVIDER;
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

function asTimestampMs(value: unknown): number | undefined {
	if (typeof value === "number" && Number.isFinite(value)) {
		return value < 10_000_000_000 ? value * 1000 : value;
	}
	if (typeof value === "string" && value.trim()) {
		const numeric = Number(value);
		if (Number.isFinite(numeric)) return numeric < 10_000_000_000 ? numeric * 1000 : numeric;
		const parsed = Date.parse(value);
		if (Number.isFinite(parsed)) return parsed;
	}
	return undefined;
}

function clamp(value: number): number {
	if (!Number.isFinite(value)) return 0;
	return Math.min(100, Math.max(0, value));
}

function normalize(value: string | undefined): string | undefined {
	return value?.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || undefined;
}

function hasHeader(headers: Record<string, string>, name: string): boolean {
	return Object.keys(headers).some((key) => key.toLowerCase() === name.toLowerCase());
}

function asError(error: unknown): Error {
	return error instanceof Error ? error : new Error(String(error));
}

function formatError(error: unknown): string {
	return asError(error).message;
}

function redact(text: string): string {
	return text
		.replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer <redacted>")
		.replace(/"access_token"\s*:\s*"[^"]+"/gi, '"access_token":"<redacted>"')
		.slice(0, 600);
}

