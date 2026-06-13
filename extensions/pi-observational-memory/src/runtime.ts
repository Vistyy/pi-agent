import { type Config, DEFAULTS, loadConfig } from "./config.js";
import type { MemoryAgentName, MemoryAgentUsage } from "./agents/common.js";

export type ResolveResult =
	| { ok: true; model: unknown; apiKey: string; headers?: Record<string, string> }
	| { ok: false; reason: string };

type NotifyLevel = "warning" | "info" | "error";
type Notify = (message: string, type?: NotifyLevel) => void;
export type MemoryUpdatePhase = "observer" | "reflector" | "curator";

export interface ResolveCtx {
	model: unknown;
	modelRegistry: any;
	hasUI: boolean;
	ui?: { notify: Notify };
}

export interface LaunchCtx {
	hasUI: boolean;
	ui?: { notify: Notify };
}

export type UsageTotals = {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	totalTokens: number;
	cost: number;
	requests: number;
};

export class Runtime {
	config: Config = { ...DEFAULTS };
	configLoaded = false;
	memoryUpdateInFlight = false;
	memoryUpdatePromise: Promise<void> | null = null;
	observerStagePromise: Promise<void> | null = null;
	memoryUpdatePhase: MemoryUpdatePhase | undefined;
	compactHookInFlight = false;
	resolveFailureNotified = false;
	lastObserverError: string | undefined;
	lastReflectorError: string | undefined;
	lastCuratorError: string | undefined;
	transientCompactionObservations: import("./session-ledger/index.js").Observation[] = [];
	transientCompactionReflections: import("./session-ledger/index.js").Reflection[] = [];
	memoryAgentUsage: Record<MemoryAgentName | "unknown", UsageTotals> = {
		observer: this.emptyUsageTotals(),
		reflector: this.emptyUsageTotals(),
		curator: this.emptyUsageTotals(),
		unknown: this.emptyUsageTotals(),
	};

	ensureConfig(cwd: string): void {
		if (this.configLoaded) return;
		this.config = loadConfig(cwd);
		this.configLoaded = true;
	}

	recordMemoryAgentUsage(event: MemoryAgentUsage): void {
		const key = event.agent ?? "unknown";
		const totals = this.memoryAgentUsage[key];
		const usage = event.usage as Record<string, unknown>;
		totals.input += this.numberValue(usage.input);
		totals.output += this.numberValue(usage.output);
		totals.cacheRead += this.numberValue(usage.cacheRead);
		totals.cacheWrite += this.numberValue(usage.cacheWrite);
		totals.totalTokens += this.numberValue(usage.totalTokens);
		const cost = usage.cost as Record<string, unknown> | undefined;
		totals.cost += this.numberValue(cost?.total);
		totals.requests++;
	}

	private emptyUsageTotals(): UsageTotals {
		return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: 0, requests: 0 };
	}

	private numberValue(value: unknown): number {
		return typeof value === "number" && Number.isFinite(value) ? value : 0;
	}

	async resolveModel(ctx: ResolveCtx): Promise<ResolveResult> {
		let model = ctx.model;
		if (this.config.model) {
			const configured = ctx.modelRegistry.find(this.config.model.provider, this.config.model.id);
			if (configured) {
				model = configured;
			} else if (ctx.hasUI && ctx.ui) {
				ctx.ui.notify(
					`Observational memory: configured model ${this.config.model.provider}/${this.config.model.id} not found, using session model`,
					"warning",
				);
			}
		}
		if (!model) return { ok: false, reason: "no model available (session has no model and no observational-memory model configured)" };
		const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
		if (!auth.ok || !auth.apiKey) {
			const provider = (model as { provider?: string }).provider ?? "unknown";
			return { ok: false, reason: `no API key for provider "${provider}"` };
		}
		return { ok: true, model, apiKey: auth.apiKey as string, headers: auth.headers as Record<string, string> | undefined };
	}

	launchMemoryUpdateTask(ctx: LaunchCtx, work: () => Promise<void>): Promise<void> {
		this.memoryUpdateInFlight = true;
		this.memoryUpdatePhase = undefined;
		this.lastObserverError = undefined;
		this.lastReflectorError = undefined;
		this.lastCuratorError = undefined;
		const promise = this.launchTrackedTask(ctx, "memory update", work, () => {
			this.memoryUpdateInFlight = false;
			this.memoryUpdatePhase = undefined;
			if (this.memoryUpdatePromise === promise) this.memoryUpdatePromise = null;
		});
		this.memoryUpdatePromise = promise;
		return promise;
	}

	recordMemoryUpdateStageError(ctx: LaunchCtx, phase: MemoryUpdatePhase, error: unknown): string {
		const message = error instanceof Error ? error.message : String(error);
		if (phase === "observer") this.lastObserverError = message;
		if (phase === "reflector") this.lastReflectorError = message;
		if (phase === "curator") this.lastCuratorError = message;
		if (ctx.hasUI && ctx.ui) ctx.ui.notify(`Observational memory: ${phase} failed: ${message}`, "warning");
		return message;
	}

	private launchTrackedTask(
		ctx: LaunchCtx,
		label: string,
		work: () => Promise<void>,
		onFinally: (error: string | undefined) => void,
	): Promise<void> {
		const hasUI = ctx.hasUI;
		const ui = ctx.ui;
		return (async () => {
			let errorMessage: string | undefined;
			try {
				await work();
			} catch (error) {
				errorMessage = error instanceof Error ? error.message : String(error);
				if (hasUI && ui) ui.notify(`Observational memory: ${label} failed: ${errorMessage}`, "warning");
			} finally {
				onFinally(errorMessage);
			}
		})();
	}
}
