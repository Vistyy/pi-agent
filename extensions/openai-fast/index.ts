import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
	getAgentDir,
	type ExtensionAPI,
	type ExtensionContext,
} from "@earendil-works/pi-coding-agent";

const STATUS_ID = "openai-fast";
const SESSION_ENTRY = "openai-fast-override-v2";
const DEFAULT_PATH = join(getAgentDir(), "state", "openai-fast-default");
const FAST_PROVIDERS = new Set(["openai", "openai-codex"]);

type SessionOverride = boolean | null;

interface FastPreferences {
	load(): Promise<boolean>;
	save(enabled: boolean): Promise<void>;
}

interface SessionEntryLike {
	readonly type: string;
	readonly customType?: string;
	readonly data?: unknown;
}

export default function openaiFast(
	pi: ExtensionAPI,
	preferences: FastPreferences = fastPreferences(),
) {
	let enabled = false;
	let generation = 0;

	pi.on("session_start", async (_event, ctx) => {
		const currentGeneration = ++generation;
		const sessionId = ctx.sessionManager.getSessionId();
		const sessionOverride = savedSessionOverride(ctx.sessionManager.getEntries(), sessionId);
		let initial = typeof sessionOverride === "boolean" ? sessionOverride : undefined;

		if (initial === undefined) {
			try {
				initial = await preferences.load();
			} catch (error) {
				if (currentGeneration === generation && ctx.hasUI) {
					ctx.ui.notify(`Could not load OpenAI fast default: ${message(error)}`, "warning");
				}
				initial = false;
			}
		}

		if (currentGeneration !== generation) return;
		enabled = initial;
		setStatus(ctx, enabled);
	});

	pi.on("model_select", (event, ctx) => {
		setStatus(ctx, enabled, event.model);
	});

	pi.registerCommand("fast", {
		description: "Toggle Fast mode for this session; /fast default on|off saves and applies the default",
		getArgumentCompletions: (prefix) =>
			["default on", "default off"].flatMap((value) =>
				value.startsWith(prefix) ? [{ value, label: value }] : [],
			),
		handler: async (args, ctx) => {
			const command = args.trim();

			if (command === "default on" || command === "default off") {
				const currentGeneration = generation;
				const nextDefault = command === "default on";
				await preferences.save(nextDefault);
				if (currentGeneration !== generation) return;

				enabled = nextDefault;
				pi.appendEntry(SESSION_ENTRY, {
					sessionId: ctx.sessionManager.getSessionId(),
					enabled: null,
				});
				setStatus(ctx, enabled);
				if (ctx.hasUI) {
					ctx.ui.notify(
						`OpenAI Fast mode default ${enabled ? "on" : "off"}; this session now follows it.`,
						"info",
					);
				}
				return;
			}

			if (command !== "") {
				if (ctx.hasUI) ctx.ui.notify("Usage: /fast or /fast default on|off", "warning");
				return;
			}

			enabled = !enabled;
			pi.appendEntry(SESSION_ENTRY, {
				sessionId: ctx.sessionManager.getSessionId(),
				enabled,
			});
			setStatus(ctx, enabled);
			if (ctx.hasUI) {
				ctx.ui.notify(
					`OpenAI Fast mode ${enabled ? "on" : "off"} for this session (saved default unchanged).`,
					"info",
				);
			}
		},
	});

	pi.on("session_shutdown", (_event, ctx) => {
		generation++;
		if (ctx.hasUI) ctx.ui.setStatus(STATUS_ID, undefined);
	});

	pi.on("before_provider_request", (event, ctx) => {
		if (!enabled || !isFastModel(ctx.model)) return;

		const payload = event.payload && typeof event.payload === "object" ? event.payload : {};
		return {
			...payload,
			service_tier: "fast",
		};
	});
}

export function fastPreferences(path = DEFAULT_PATH): FastPreferences {
	return {
		async load() {
			let text: string;
			try {
				text = await readFile(path, "utf8");
			} catch (error) {
				if (isNotFound(error)) return false;
				throw error;
			}

			if (text.trim() === "on") return true;
			if (text.trim() === "off") return false;
			throw new Error(`Invalid OpenAI fast default in ${path}; expected on or off.`);
		},
		async save(enabled) {
			await mkdir(dirname(path), { recursive: true });
			const temporary = `${path}.${randomUUID()}.tmp`;
			try {
				await writeFile(temporary, enabled ? "on\n" : "off\n", { mode: 0o600 });
				await rename(temporary, path);
			} finally {
				await rm(temporary, { force: true });
			}
		},
	};
}

export function savedSessionOverride(
	entries: readonly SessionEntryLike[],
	sessionId: string,
): SessionOverride | undefined {
	for (let index = entries.length - 1; index >= 0; index--) {
		const entry = entries[index];
		if (entry.type !== "custom" || entry.customType !== SESSION_ENTRY) continue;
		if (!isSessionPreference(entry.data) || entry.data.sessionId !== sessionId) continue;
		return entry.data.enabled;
	}
	return undefined;
}

function setStatus(ctx: ExtensionContext, enabled: boolean, model = ctx.model): void {
	if (!ctx.hasUI) return;
	const status = enabled && isFastModel(model) ? ctx.ui.theme.fg("accent", "⚡") : undefined;
	ctx.ui.setStatus(STATUS_ID, status);
}

function isFastModel(model: ExtensionContext["model"]): boolean {
	return model != null && FAST_PROVIDERS.has(model.provider);
}

function isSessionPreference(value: unknown): value is { sessionId: string; enabled: SessionOverride } {
	return (
		typeof value === "object" &&
		value !== null &&
		typeof (value as { sessionId?: unknown }).sessionId === "string" &&
		((value as { enabled?: unknown }).enabled === null ||
			typeof (value as { enabled?: unknown }).enabled === "boolean")
	);
}

function isNotFound(error: unknown): boolean {
	return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function message(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
