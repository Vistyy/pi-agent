import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockAgents = vi.hoisted(() => ({
	runObserver: vi.fn(),
	runReflector: vi.fn(),
	runDropper: vi.fn(),
}));

vi.mock("../src/agents/observer/agent.js", () => ({ runObserver: mockAgents.runObserver }));
vi.mock("../src/agents/reflector/agent.js", () => ({ runReflector: mockAgents.runReflector }));
vi.mock("../src/agents/dropper/agent.js", () => ({ runDropper: mockAgents.runDropper }));

import { ensureConsolidatedBeforeCompaction, registerConsolidationTrigger } from "../src/hooks/consolidation-trigger.js";
import type { Runtime } from "../src/runtime.js";
import {
	OM_OBSERVATIONS_DROPPED,
	OM_OBSERVATIONS_RECORDED,
	OM_REFLECTIONS_RECORDED,
} from "../src/session-ledger/index.js";
import {
	observation,
	observationsDroppedEntry,
	observationsRecordedEntry,
	reflection,
	reflectionsRecordedEntry,
	textCustomMessage,
	type TestEntry,
} from "./fixtures/session.js";
import { consolidationApi, type AgentStartHandler, type TurnEndHandler } from "./fixtures/pi.js";

beforeEach(() => {
	mockAgents.runObserver.mockReset();
	mockAgents.runReflector.mockReset();
	mockAgents.runDropper.mockReset();
	mockAgents.runObserver.mockResolvedValue(undefined);
	mockAgents.runReflector.mockResolvedValue(undefined);
	mockAgents.runDropper.mockResolvedValue(undefined);
});

function setup(args: {
	entries: TestEntry[];
	observeEveryMessages?: number;
	reflectAfterTokens?: number;
	observationsPoolMaxTokens?: number;
	observationsPoolTargetTokens?: number;
	maxInitialObserveTokens?: number;
	strategy?: "additive" | "replacement" | "off";
	consolidationInFlight?: boolean;
	appendEntryReturnsId?: boolean;
}) {
	let entries = [...args.entries];
	const handlers: { agent_start?: AgentStartHandler; turn_end?: TurnEndHandler } = {};
	const appendEntry = vi.fn((customType: string, data: unknown) => {
		const id = `appended-${appendEntry.mock.calls.length}`;
		entries = [...entries, { type: "custom", id, parentId: entries.at(-1)?.id ?? null, timestamp: "2026-05-02T10:00:00.000Z", customType, data }];
		return args.appendEntryReturnsId === false ? undefined : id;
	});
	const pi = consolidationApi(handlers, appendEntry);
	let launchedWork: (() => Promise<void>) | undefined;
	const runtime = {
		config: {
			strategy: args.strategy ?? "additive",
			debugLog: false,
			observeEveryMessages: args.observeEveryMessages ?? 1,
			reflectAfterTokens: args.reflectAfterTokens ?? 1,
			maxInitialObserveTokens: args.maxInitialObserveTokens ?? 100_000,
			observationsPoolMaxTokens: args.observationsPoolMaxTokens ?? 100,
			observationsPoolTargetTokens: args.observationsPoolTargetTokens ?? Math.floor((args.observationsPoolMaxTokens ?? 100) / 2),
			agentMaxTurns: 9,
			model: { provider: "anthropic", id: "memory", thinking: "minimal" },
		},
		consolidationInFlight: args.consolidationInFlight ?? false,
		consolidationPhase: undefined as "observer" | "reflector" | "dropper" | undefined,
		resolveFailureNotified: false,
		lastObserverError: undefined as string | undefined,
		lastReflectorError: undefined as string | undefined,
		lastDropperError: undefined as string | undefined,
		ensureConfig: vi.fn(),
		resolveModel: vi.fn(async () => ({ ok: true, model: { reasoning: true }, apiKey: "key", headers: { h: "v" } })),
		launchConsolidationTask: vi.fn((_ctx, work) => {
			runtime.consolidationInFlight = true;
			launchedWork = work;
			return Promise.resolve();
		}),
		recordConsolidationStageError: vi.fn((ctx, phase: "observer" | "reflector" | "dropper", error: unknown) => {
			const message = error instanceof Error ? error.message : String(error);
			if (phase === "observer") runtime.lastObserverError = message;
			if (phase === "reflector") runtime.lastReflectorError = message;
			if (phase === "dropper") runtime.lastDropperError = message;
			ctx.ui?.notify(`Observational memory: ${phase} failed: ${message}`, "warning");
			return message;
		}),
	};
	registerConsolidationTrigger(pi, runtime as Runtime);
	if (!handlers.agent_start) throw new Error("agent_start consolidation handler not registered");
	if (!handlers.turn_end) throw new Error("turn_end consolidation handler not registered");
	const ctx = {
		cwd: "/tmp/project",
		hasUI: true,
		ui: { notify: vi.fn() },
		model: { provider: "session" },
		modelRegistry: {},
		sessionManager: { getBranch: () => entries },
	} as unknown as ExtensionContext;
	return {
		pi,
		runtime,
		ctx,
		fire: (eventName: "agent_start" | "turn_end" = "turn_end") => handlers[eventName]!({ type: eventName } as never, ctx),
		fireAgentStart: () => handlers.agent_start!({ type: "agent_start" } as never, ctx),
		fireTurnEnd: () => handlers.turn_end!({ type: "turn_end" } as never, ctx),
		runLaunchedWork: async () => launchedWork?.(),
		getEntries: () => entries,
		getAppends: () => appendEntry.mock.calls.map(([customType, data]) => ({ customType, data })),
	};
}

describe("consolidation trigger", () => {
	const obsA = observation("aaaaaaaaaaaa", { sourceEntryIds: ["raw-1"], tokenCount: 10 });

	it("force-observes unobserved source entries before the compaction kept tail", async () => {
		const obs = observation("bbbbbbbbbbbb", { sourceEntryIds: ["raw-1"] });
		mockAgents.runObserver.mockResolvedValueOnce([obs]);
		const entries = [textCustomMessage("raw-1", "aaaa"), textCustomMessage("raw-2", "bbbb")];
		const { pi, runtime, ctx, getAppends } = setup({ entries, observeEveryMessages: 999, reflectAfterTokens: 999 });

		await ensureConsolidatedBeforeCompaction(pi as never, runtime as Runtime, ctx as never, { firstKeptEntryId: "raw-2" });

		expect(mockAgents.runObserver).toHaveBeenCalledOnce();
		expect(mockAgents.runObserver.mock.calls[0][0].chunk).toContain("[Source entry id: raw-1]");
		expect(mockAgents.runObserver.mock.calls[0][0].chunk).not.toContain("[Source entry id: raw-2]");
		expect(getAppends()).toEqual([
			expect.objectContaining({ customType: OM_OBSERVATIONS_RECORDED }),
		]);
	});
	const obsB = observation("bbbbbbbbbbbb", { sourceEntryIds: ["raw-2"], tokenCount: 10 });
	const refA = reflection("eeeeeeeeeeee", ["aaaaaaaaaaaa"]);

	it("does not launch below all thresholds from either entrypoint", () => {
		const entries = [
			textCustomMessage("raw-1", "aaaa"),
			observationsRecordedEntry("om-obs", { observations: [obsA], coversUpToId: "raw-1" }),
			reflectionsRecordedEntry("om-ref", { reflections: [refA], coversUpToId: "raw-1" }),
			observationsDroppedEntry("om-drop", { observationIds: ["aaaaaaaaaaaa"], coversUpToId: "raw-1" }),
		];
		const { fireAgentStart, fireTurnEnd, runtime } = setup({ entries, observeEveryMessages: 10, reflectAfterTokens: 10 });

		fireAgentStart();
		fireTurnEnd();

		expect(runtime.launchConsolidationTask).not.toHaveBeenCalled();
	});

	it("does not launch from either entrypoint when strategy is off", () => {
		const entries = [textCustomMessage("raw-1", "aaaaaaaa")];
		const disabled = setup({ entries, strategy: "off" });

		disabled.fireAgentStart();
		disabled.fireTurnEnd();

		expect(disabled.runtime.launchConsolidationTask).not.toHaveBeenCalled();
	});

	it("does not launch from either entrypoint while consolidation is already in flight", () => {
		const entries = [textCustomMessage("raw-1", "aaaaaaaa")];
		const locked = setup({ entries, consolidationInFlight: true });

		locked.fireAgentStart();
		locked.fireTurnEnd();

		expect(locked.runtime.launchConsolidationTask).not.toHaveBeenCalled();
	});

	it("uses the shared lock when agent_start fires before turn_end", () => {
		const entries = [textCustomMessage("raw-1", "aaaaaaaa")];
		const { fireAgentStart, fireTurnEnd, runtime } = setup({ entries });

		fireAgentStart();
		fireTurnEnd();

		expect(runtime.launchConsolidationTask).toHaveBeenCalledTimes(1);
	});

	it("runs observer first and appends source-addressed observations", async () => {
		const obs = observation("cccccccccccc", { sourceEntryIds: ["raw-1"], tokenCount: 4 });
		mockAgents.runObserver.mockResolvedValueOnce([obs]);
		const entries = [textCustomMessage("raw-1", "aaaaaaaa")];
		const { fire, runLaunchedWork, pi, runtime } = setup({ entries, reflectAfterTokens: 999 });

		fire();
		await runLaunchedWork();

		expect(runtime.launchConsolidationTask).toHaveBeenCalled();
		expect(mockAgents.runObserver).toHaveBeenCalledWith(expect.objectContaining({
			allowedSourceEntryIds: ["raw-1"],
			maxTurns: 9,
			thinkingLevel: "minimal",
		}));
		expect(pi.appendEntry).toHaveBeenCalledWith(OM_OBSERVATIONS_RECORDED, { observations: [obs], coversUpToId: "raw-1" });
	});

	it("uses existing observation coverage and retries larger ranges after no-output", async () => {
		const prior = observation("cccccccccccc", { sourceEntryIds: ["raw-1"] });
		const newObs = observation("dddddddddddd", { sourceEntryIds: ["raw-2"] });
		mockAgents.runObserver.mockResolvedValueOnce([newObs]);
		const entries = [
			textCustomMessage("raw-1", "aaaa"),
			observationsRecordedEntry("om-prior", { observations: [prior], coversUpToId: "raw-1" }),
			textCustomMessage("raw-2", "bbbbbbbb"),
			textCustomMessage("raw-3", "cccccccc"),
		];
		const { fire, runLaunchedWork, pi } = setup({ entries, reflectAfterTokens: 999 });

		fire();
		await runLaunchedWork();

		expect(mockAgents.runObserver).toHaveBeenCalledWith(expect.objectContaining({ allowedSourceEntryIds: ["raw-2", "raw-3"] }));
		expect(pi.appendEntry).toHaveBeenCalledWith(OM_OBSERVATIONS_RECORDED, { observations: [newObs], coversUpToId: "raw-3" });
	});

	it("skips initial observer backfill when the existing session is too large", async () => {
		const entries = [textCustomMessage("raw-1", "aaaaaaaa")];
		const { fire, runLaunchedWork, getAppends, ctx } = setup({ entries, maxInitialObserveTokens: 1 });

		fire();
		await runLaunchedWork();

		expect(mockAgents.runObserver).not.toHaveBeenCalled();
		expect(getAppends()).toEqual([
			{ customType: OM_OBSERVATIONS_RECORDED, data: { observations: [], coversUpToId: "raw-1" } },
		]);
		expect(ctx.ui.notify).toHaveBeenCalledWith(
			"Observational memory: skipped initial backfill for large existing session (~2 tokens); observing future turns",
			"warning",
		);
	});

	it("observer no-output appends nothing and does not fake observation coverage", async () => {
		const entries = [textCustomMessage("raw-1", "aaaaaaaa")];
		const { fire, runLaunchedWork, getAppends } = setup({ entries });

		fire();
		await runLaunchedWork();

		expect(getAppends()).toEqual([]);
		expect(mockAgents.runReflector).not.toHaveBeenCalled();
		expect(mockAgents.runDropper).not.toHaveBeenCalled();
	});

	it("model resolution failure skips appending and notifies once", async () => {
		const entries = [textCustomMessage("raw-1", "aaaaaaaa")];
		const { fire, runLaunchedWork, pi, runtime, ctx } = setup({ entries });
		runtime.resolveModel.mockResolvedValueOnce({ ok: false, reason: "no model" });

		fire();
		await runLaunchedWork();

		expect(pi.appendEntry).not.toHaveBeenCalled();
		expect(ctx.ui.notify).toHaveBeenCalledWith("Observational memory: observer skipped — no model", "warning");
	});

	it("re-reads branch so observer append can unblock reflector in the same consolidation run", async () => {
		mockAgents.runObserver.mockResolvedValueOnce([obsA]);
		const newRef = reflection("ffffffffffff", ["aaaaaaaaaaaa"]);
		mockAgents.runReflector.mockResolvedValueOnce([newRef]);
		const entries = [textCustomMessage("raw-1", "aaaaaaaa")];
		const { fire, runLaunchedWork, getAppends } = setup({ entries });

		fire();
		await runLaunchedWork();

		expect(mockAgents.runObserver).toHaveBeenCalled();
		expect(mockAgents.runReflector).toHaveBeenCalledWith(expect.objectContaining({ observations: [obsA] }));
		expect(getAppends()).toEqual([
			{ customType: OM_OBSERVATIONS_RECORDED, data: { observations: [obsA], coversUpToId: "raw-1" } },
			{ customType: OM_REFLECTIONS_RECORDED, data: { reflections: [newRef], coversUpToId: "raw-1" } },
		]);
	});

	it("runs reflector-only and appends non-empty reflections", async () => {
		const newRef = reflection("ffffffffffff", ["aaaaaaaaaaaa"]);
		mockAgents.runReflector.mockResolvedValueOnce([newRef]);
		const entries = [
			textCustomMessage("raw-1", "aaaaaaaa"),
			observationsRecordedEntry("om-obs", { observations: [obsA], coversUpToId: "raw-1" }),
			textCustomMessage("raw-2", "bbbbbbbb"),
			observationsDroppedEntry("om-drop", { observationIds: ["bbbbbbbbbbbb"], coversUpToId: "raw-2" }),
		];
		const { fire, runLaunchedWork, pi } = setup({ entries, observeEveryMessages: 999 });

		fire();
		await runLaunchedWork();

		expect(mockAgents.runReflector).toHaveBeenCalledWith(expect.objectContaining({ observations: [obsA], maxTurns: 9, thinkingLevel: "minimal" }));
		expect(mockAgents.runDropper).not.toHaveBeenCalled();
		expect(pi.appendEntry).toHaveBeenCalledWith(OM_REFLECTIONS_RECORDED, { reflections: [newRef], coversUpToId: "raw-1" });
	});

	it("runs dropper after same-run non-empty reflector output and appends non-empty drops", async () => {
		const newRef = reflection("ffffffffffff", ["aaaaaaaaaaaa"]);
		mockAgents.runReflector.mockResolvedValueOnce([newRef]);
		mockAgents.runDropper.mockResolvedValueOnce(["aaaaaaaaaaaa"]);
		const entries = [
			textCustomMessage("raw-1", "aaaaaaaa"),
			observationsRecordedEntry("om-obs", { observations: [obsA], coversUpToId: "raw-1" }),
			textCustomMessage("raw-2", "bbbbbbbb"),
		];
		const { fire, runLaunchedWork, getAppends } = setup({ entries, observeEveryMessages: 999, observationsPoolTargetTokens: 5 });

		fire();
		await runLaunchedWork();

		expect(mockAgents.runReflector).toHaveBeenCalled();
		expect(mockAgents.runDropper).toHaveBeenCalledWith(expect.objectContaining({ reflections: [newRef], observations: [obsA] }));
		expect(getAppends()).toEqual([
			{ customType: OM_REFLECTIONS_RECORDED, data: { reflections: [newRef], coversUpToId: "raw-1" } },
			{ customType: OM_OBSERVATIONS_DROPPED, data: { observationIds: ["aaaaaaaaaaaa"], coversUpToId: "raw-1" } },
		]);
	});

	it("waits for successful reflection even when active observation pool is over target", async () => {
		const entries = [
			textCustomMessage("raw-1", "aaaaaaaa"),
			observationsRecordedEntry("om-obs", { observations: [obsA], coversUpToId: "raw-1" }),
			textCustomMessage("raw-2", "bbbbbbbb"),
		];
		const { fire, runLaunchedWork, runtime } = setup({ entries, observeEveryMessages: 999, reflectAfterTokens: 1, observationsPoolTargetTokens: 5 });

		fire();
		await runLaunchedWork();

		expect(runtime.launchConsolidationTask).toHaveBeenCalledTimes(1);
		expect(mockAgents.runReflector).toHaveBeenCalled();
		expect(mockAgents.runDropper).not.toHaveBeenCalled();
	});

	it("runs reflector before dropper and covers drops through same-run reflection coverage", async () => {
		const newRef = reflection("ffffffffffff", ["bbbbbbbbbbbb"]);
		mockAgents.runReflector.mockResolvedValueOnce([newRef]);
		mockAgents.runDropper.mockResolvedValueOnce(["bbbbbbbbbbbb"]);
		const entries = [
			textCustomMessage("raw-1", "aaaaaaaa"),
			observationsRecordedEntry("om-obs-a", { observations: [obsA], coversUpToId: "raw-1" }),
			textCustomMessage("raw-2", "bbbbbbbb"),
			observationsRecordedEntry("om-obs-b", { observations: [obsB], coversUpToId: "raw-2" }),
		];
		const { fire, runLaunchedWork, getAppends } = setup({ entries, observeEveryMessages: 999, observationsPoolMaxTokens: 10 });

		fire();
		await runLaunchedWork();

		expect(mockAgents.runDropper).toHaveBeenCalledWith(expect.objectContaining({ reflections: [newRef] }));
		expect(getAppends()).toEqual([
			{ customType: OM_REFLECTIONS_RECORDED, data: { reflections: [newRef], coversUpToId: "raw-2" } },
			{ customType: OM_OBSERVATIONS_DROPPED, data: { observationIds: ["bbbbbbbbbbbb"], coversUpToId: "raw-2" } },
		]);
	});

	it("appends no empty reflection or drop entries", async () => {
		const entries = [textCustomMessage("raw-1", "aaaaaaaa"), observationsRecordedEntry("om-obs", { observations: [obsA], coversUpToId: "raw-1" })];
		const { fire, runLaunchedWork, pi, ctx } = setup({ entries, observeEveryMessages: 999 });

		fire();
		await runLaunchedWork();

		expect(pi.appendEntry).not.toHaveBeenCalled();
		expect(mockAgents.runDropper).not.toHaveBeenCalled();
		expect(ctx.ui.notify).not.toHaveBeenCalledWith(expect.stringContaining("dropper running"), "info");
	});

	it("preserves stage failure boundaries", async () => {
		mockAgents.runObserver.mockRejectedValueOnce(new Error("observe failed"));
		const observerFailure = setup({ entries: [textCustomMessage("raw-1", "aaaaaaaa")] });
		observerFailure.fire();
		await observerFailure.runLaunchedWork();
		expect(observerFailure.runtime.lastObserverError).toBe("observe failed");
		expect(mockAgents.runReflector).not.toHaveBeenCalled();
		expect(mockAgents.runDropper).not.toHaveBeenCalled();

		mockAgents.runObserver.mockReset();
		mockAgents.runObserver.mockResolvedValue(undefined);
		mockAgents.runReflector.mockReset();
		mockAgents.runReflector.mockRejectedValueOnce(new Error("reflect failed"));
		const reflectorFailure = setup({ entries: [textCustomMessage("raw-1", "aaaaaaaa"), observationsRecordedEntry("om-obs", { observations: [obsA], coversUpToId: "raw-1" })], observeEveryMessages: 999 });
		reflectorFailure.fire();
		await reflectorFailure.runLaunchedWork();
		expect(reflectorFailure.runtime.lastReflectorError).toBe("reflect failed");
		expect(mockAgents.runDropper).not.toHaveBeenCalled();
		expect(reflectorFailure.pi.appendEntry).not.toHaveBeenCalled();

		mockAgents.runReflector.mockReset();
		const newRef = reflection("ffffffffffff", ["aaaaaaaaaaaa"]);
		mockAgents.runReflector.mockResolvedValueOnce([newRef]);
		mockAgents.runDropper.mockReset();
		mockAgents.runDropper.mockRejectedValueOnce(new Error("drop failed"));
		const dropperFailure = setup({ entries: [textCustomMessage("raw-1", "aaaaaaaa"), observationsRecordedEntry("om-obs", { observations: [obsA], coversUpToId: "raw-1" })], observeEveryMessages: 999, observationsPoolMaxTokens: 10 });
		dropperFailure.fire();
		await dropperFailure.runLaunchedWork();
		expect(dropperFailure.runtime.lastDropperError).toBe("drop failed");
		expect(dropperFailure.pi.appendEntry).toHaveBeenCalledTimes(1);
		expect(dropperFailure.pi.appendEntry).toHaveBeenCalledWith(OM_REFLECTIONS_RECORDED, { reflections: [newRef], coversUpToId: "raw-1" });
	});
});
