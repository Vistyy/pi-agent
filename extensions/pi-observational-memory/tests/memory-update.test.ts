import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockAgents = vi.hoisted(() => ({
	runObserver: vi.fn(),
	runReflector: vi.fn(),
	runCurator: vi.fn(),
}));

vi.mock("../src/agents/observer/agent.js", () => ({ runObserver: mockAgents.runObserver }));
vi.mock("../src/agents/reflector/agent.js", () => ({ runReflector: mockAgents.runReflector }));
vi.mock("../src/agents/curator/agent.js", () => ({ runCurator: mockAgents.runCurator }));

import { ensureObservedBeforeCompaction } from "../src/memory-update/compaction.js";
import { registerMemoryUpdateHook } from "../src/memory-update/scheduler.js";
import { Runtime } from "../src/runtime.js";
import {
	OM_AGENT_RUN_RECORDED,
	OM_OBSERVATIONS_CURATED,
	OM_OBSERVATIONS_DROPPED,
	OM_OBSERVATIONS_RECORDED,
	OM_REFLECTIONS_RECORDED,
	OM_REFLECTIONS_REVIEWED,
} from "../src/session-ledger/index.js";
import {
	observation,
	observationsDroppedEntry,
	observationsFlaggedEntry,
	observationsPinnedEntry,
	observationsRecordedEntry,
	reflection,
	reflectionsRecordedEntry,
	reflectionsReviewedEntry,
	rawMessage,
	type TestEntry,
} from "./fixtures/session.js";
import { memoryUpdateApi, type AgentStartHandler, type TurnEndHandler } from "./fixtures/pi.js";

beforeEach(() => {
	mockAgents.runObserver.mockReset();
	mockAgents.runReflector.mockReset();
	mockAgents.runCurator.mockReset();
	mockAgents.runObserver.mockResolvedValue(undefined);
	mockAgents.runReflector.mockResolvedValue(undefined);
	mockAgents.runCurator.mockResolvedValue(undefined);
});

function setup(args: {
	entries: TestEntry[];
	observeEveryMessages?: number;
	reflectEveryObservations?: number;
	emergencyCurateWhenVisibleObservationsOver?: number;
	observationsPoolMaxTokens?: number;
	maxInitialObserveTokens?: number;
	strategy?: "replacement" | "off";
	memoryUpdateInFlight?: boolean;
	inFlightObserverStagePromise?: Promise<void> | null;
	appendEntryReturnsId?: boolean;
}) {
	let entries = [...args.entries];
	const handlers: { agent_start?: AgentStartHandler; turn_end?: TurnEndHandler } = {};
	const appendEntry = vi.fn((customType: string, data: unknown) => {
		const id = `appended-${appendEntry.mock.calls.length}`;
		entries = [...entries, { type: "custom", id, parentId: entries.at(-1)?.id ?? null, timestamp: "2026-05-02T10:00:00.000Z", customType, data }];
		return args.appendEntryReturnsId === false ? undefined : id;
	});
	const pi = memoryUpdateApi(handlers, appendEntry);
	let launchedWork: (() => Promise<void>) | undefined;
	const runtime = {
		config: {
			strategy: args.strategy ?? "replacement",
			debugLog: false,
			observeEveryMessages: args.observeEveryMessages ?? 1,
			reflectEveryObservations: args.reflectEveryObservations ?? 1,
			maxInitialObserveTokens: args.maxInitialObserveTokens ?? 100_000,
			observationsPoolMaxTokens: args.observationsPoolMaxTokens ?? 100,
			emergencyCurateWhenVisibleObservationsOver: args.emergencyCurateWhenVisibleObservationsOver ?? 60,
			protectRecentObservations: 32,
			agentMaxTurns: 9,
			model: { provider: "anthropic", id: "memory", thinking: "minimal" },
		},
		memoryUpdateInFlight: args.memoryUpdateInFlight ?? false,
		inFlightObserverStagePromise: args.inFlightObserverStagePromise ?? null,
		memoryUpdatePhase: undefined as "observer" | "reflector" | "curator" | undefined,
		resolveFailureNotified: false,
		lastObserverError: undefined as string | undefined,
		lastReflectorError: undefined as string | undefined,
		lastCuratorError: undefined as string | undefined,
		ensureConfig: vi.fn(),
		resolveModel: vi.fn(async () => ({ ok: true, model: { reasoning: true }, apiKey: "key", headers: { h: "v" } })),
		launchMemoryUpdateTask: vi.fn((_ctx, work) => {
			runtime.memoryUpdateInFlight = true;
			launchedWork = work;
			return Promise.resolve();
		}),
		recordMemoryUpdateStageError: vi.fn((ctx, phase: "observer" | "reflector" | "curator", error: unknown) => {
			const message = error instanceof Error ? error.message : String(error);
			if (phase === "observer") runtime.lastObserverError = message;
			if (phase === "reflector") runtime.lastReflectorError = message;
			if (phase === "curator") runtime.lastCuratorError = message;
			ctx.ui?.notify(`Observational memory: ${phase} failed: ${message}`, "warning");
			return message;
		}),
	};
	registerMemoryUpdateHook(pi, runtime as Runtime);
	if (!handlers.agent_start) throw new Error("agent_start memory update handler not registered");
	if (!handlers.turn_end) throw new Error("turn_end memory update handler not registered");
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
		getMemoryAppends: () => appendEntry.mock.calls
			.map(([customType, data]) => ({ customType, data }))
			.filter((entry) => entry.customType !== OM_AGENT_RUN_RECORDED),
	};
}

describe("memory update hook", () => {
	const obsA = observation("aaaaaaaaaaaa", { sourceEntryIds: ["raw-1"] });

	it("force-observes unobserved source entries before the compaction kept tail", async () => {
		const obs = observation("bbbbbbbbbbbb", { sourceEntryIds: ["raw-1"] });
		mockAgents.runObserver.mockResolvedValueOnce([obs]);
		const entries = [rawMessage("raw-1", "aaaa"), rawMessage("raw-2", "bbbb")];
		const { pi, runtime, ctx, getMemoryAppends } = setup({ entries, observeEveryMessages: 999, reflectEveryObservations: 999 });

		await ensureObservedBeforeCompaction(pi as never, runtime as Runtime, ctx as never, { firstKeptEntryId: "raw-2" });

		expect(mockAgents.runObserver).toHaveBeenCalledOnce();
		expect(mockAgents.runReflector).not.toHaveBeenCalled();
		expect(mockAgents.runCurator).not.toHaveBeenCalled();
		expect(mockAgents.runObserver.mock.calls[0][0].chunk).toContain("[Source entry id: raw-1]");
		expect(mockAgents.runObserver.mock.calls[0][0].chunk).not.toContain("[Source entry id: raw-2]");
		expect(getMemoryAppends()).toEqual([
			expect.objectContaining({ customType: OM_OBSERVATIONS_RECORDED }),
		]);
	});

	it("does not wait for non-observer memory updates before compaction safety observe", async () => {
		const obs = observation("bbbbbbbbbbbb", { sourceEntryIds: ["raw-1"] });
		mockAgents.runObserver.mockResolvedValueOnce([obs]);
		const entries = [rawMessage("raw-1", "aaaa"), rawMessage("raw-2", "bbbb")];
		const { pi, runtime, ctx } = setup({ entries, memoryUpdateInFlight: true, observeEveryMessages: 999, reflectEveryObservations: 999 });

		await expect(ensureObservedBeforeCompaction(pi as never, runtime as Runtime, ctx as never, { firstKeptEntryId: "raw-2" })).resolves.toBeUndefined();

		expect(mockAgents.runObserver).toHaveBeenCalledOnce();
	});

	it("waits for an in-flight observer stage before deciding whether compaction safety observe is needed", async () => {
		let releaseObserver!: () => void;
		const inFlightObserverStagePromise = new Promise<void>((resolve) => { releaseObserver = resolve; });
		const entries = [rawMessage("raw-1", "aaaa"), rawMessage("raw-2", "bbbb")];
		const { pi, runtime, ctx } = setup({ entries, inFlightObserverStagePromise, observeEveryMessages: 999, reflectEveryObservations: 999 });

		let completed = false;
		const compaction = ensureObservedBeforeCompaction(pi as never, runtime as Runtime, ctx as never, { firstKeptEntryId: "raw-2" }).then(() => { completed = true; });
		await Promise.resolve();

		expect(completed).toBe(false);
		expect(mockAgents.runObserver).not.toHaveBeenCalled();

		releaseObserver();
		await compaction;

		expect(mockAgents.runObserver).toHaveBeenCalledOnce();
	});
	const obsB = observation("bbbbbbbbbbbb", { sourceEntryIds: ["raw-2"] });
	const refA = reflection("eeeeeeeeeeee", ["aaaaaaaaaaaa"]);

	it("does not launch below all thresholds from either entrypoint", () => {
		const entries = [
			rawMessage("raw-1", "aaaa"),
			observationsRecordedEntry("om-obs", { observations: [obsA], coversUpToId: "raw-1" }),
			reflectionsRecordedEntry("om-ref", { reflections: [refA], coversUpToId: "raw-1" }),
			observationsDroppedEntry("om-drop", { observationIds: ["aaaaaaaaaaaa"], coversUpToId: "raw-1" }),
		];
		const { fireAgentStart, fireTurnEnd, runtime } = setup({ entries, observeEveryMessages: 10, reflectEveryObservations: 10 });

		fireAgentStart();
		fireTurnEnd();

		expect(runtime.launchMemoryUpdateTask).not.toHaveBeenCalled();
	});

	it("runs curator alone when visible observations exceed emergency pressure", async () => {
		const obs1 = observation("aaaaaaaaaaaa", { sourceEntryIds: ["raw-1"] });
		const obs2 = observation("bbbbbbbbbbbb", { sourceEntryIds: ["raw-2"] });
		const obs3 = observation("cccccccccccc", { sourceEntryIds: ["raw-3"] });
		mockAgents.runCurator.mockResolvedValueOnce({ pinned: [], unpinned: [], flagged: [], dropped: [] });
		const entries = [
			rawMessage("raw-1", "aaaa"),
			rawMessage("raw-2", "bbbb"),
			rawMessage("raw-3", "cccc"),
			observationsRecordedEntry("om-obs", { observations: [obs1, obs2, obs3], coversUpToId: "raw-3" }),
			reflectionsReviewedEntry("om-reviewed", { coversUpToId: "raw-3" }),
			observationsPinnedEntry("om-pin", { observationIds: ["aaaaaaaaaaaa", "bbbbbbbbbbbb", "cccccccccccc"], reason: "Keep visible." }),
		];
		const { fire, runLaunchedWork } = setup({ entries, observeEveryMessages: 999, reflectEveryObservations: 999, emergencyCurateWhenVisibleObservationsOver: 2 });

		fire();
		await runLaunchedWork();

		expect(mockAgents.runObserver).not.toHaveBeenCalled();
		expect(mockAgents.runReflector).not.toHaveBeenCalled();
		expect(mockAgents.runCurator).toHaveBeenCalledOnce();
		expect(mockAgents.runCurator).toHaveBeenCalledWith(expect.objectContaining({
			candidateObservationIds: ["aaaaaaaaaaaa", "bbbbbbbbbbbb", "cccccccccccc"],
		}));
	});

	it("does not launch from either entrypoint when strategy is off", () => {
		const entries = [rawMessage("raw-1", "aaaaaaaa")];
		const disabled = setup({ entries, strategy: "off" });

		disabled.fireAgentStart();
		disabled.fireTurnEnd();

		expect(disabled.runtime.launchMemoryUpdateTask).not.toHaveBeenCalled();
	});

	it("does not launch from either entrypoint while memory update is already in flight", () => {
		const entries = [rawMessage("raw-1", "aaaaaaaa")];
		const locked = setup({ entries, memoryUpdateInFlight: true });

		locked.fireAgentStart();
		locked.fireTurnEnd();

		expect(locked.runtime.launchMemoryUpdateTask).not.toHaveBeenCalled();
	});

	it("uses the shared lock when agent_start fires before turn_end", () => {
		const entries = [rawMessage("raw-1", "aaaaaaaa")];
		const { fireAgentStart, fireTurnEnd, runtime } = setup({ entries });

		fireAgentStart();
		fireTurnEnd();

		expect(runtime.launchMemoryUpdateTask).toHaveBeenCalledTimes(1);
	});

	it("runs observer first and appends source-addressed observations", async () => {
		const obs = observation("cccccccccccc", { sourceEntryIds: ["raw-1"] });
		mockAgents.runObserver.mockResolvedValueOnce([obs]);
		const entries = [rawMessage("raw-1", "aaaaaaaa")];
		const { fire, runLaunchedWork, pi, runtime } = setup({ entries, reflectEveryObservations: 999 });

		fire();
		await runLaunchedWork();

		expect(runtime.launchMemoryUpdateTask).toHaveBeenCalled();
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
			rawMessage("raw-1", "aaaa"),
			observationsRecordedEntry("om-prior", { observations: [prior], coversUpToId: "raw-1" }),
			rawMessage("raw-2", "bbbbbbbb"),
			rawMessage("raw-3", "cccccccc"),
		];
		const { fire, runLaunchedWork, pi } = setup({ entries, reflectEveryObservations: 999 });

		fire();
		await runLaunchedWork();

		expect(mockAgents.runObserver).toHaveBeenCalledWith(expect.objectContaining({ allowedSourceEntryIds: ["raw-2", "raw-3"] }));
		expect(pi.appendEntry).toHaveBeenCalledWith(OM_OBSERVATIONS_RECORDED, { observations: [newObs], coversUpToId: "raw-3" });
	});

	it("skips initial observer backfill when the existing session is too large", async () => {
		const entries = [rawMessage("raw-1", "aaaaaaaa")];
		const { fire, runLaunchedWork, getMemoryAppends, ctx } = setup({ entries, maxInitialObserveTokens: 1 });

		fire();
		await runLaunchedWork();

		expect(mockAgents.runObserver).not.toHaveBeenCalled();
		expect(getMemoryAppends()).toEqual([
			{ customType: OM_OBSERVATIONS_RECORDED, data: { observations: [], coversUpToId: "raw-1" } },
		]);
		expect(ctx.ui.notify).toHaveBeenCalledWith(
			"Observational memory: skipped initial backfill for large existing session (~2 tokens); observing future turns",
			"warning",
		);
	});

	it("observer no-output appends nothing and does not fake observation coverage", async () => {
		const entries = [rawMessage("raw-1", "aaaaaaaa")];
		const { fire, runLaunchedWork, getMemoryAppends } = setup({ entries });

		fire();
		await runLaunchedWork();

		expect(getMemoryAppends()).toEqual([]);
		expect(mockAgents.runReflector).not.toHaveBeenCalled();
		expect(mockAgents.runCurator).not.toHaveBeenCalled();
	});

	it("model resolution failure skips appending and notifies once", async () => {
		const entries = [rawMessage("raw-1", "aaaaaaaa")];
		const { fire, runLaunchedWork, getMemoryAppends, runtime, ctx } = setup({ entries });
		runtime.resolveModel.mockResolvedValueOnce({ ok: false, reason: "no model" });

		fire();
		await runLaunchedWork();

		expect(getMemoryAppends()).toEqual([]);
		expect(ctx.ui.notify).toHaveBeenCalledWith("Observational memory: observer skipped — no model", "warning");
	});

	it("re-reads branch so observer append can unblock reflector in the same memory update run", async () => {
		mockAgents.runObserver.mockResolvedValueOnce([obsA]);
		const newRef = reflection("ffffffffffff", ["aaaaaaaaaaaa"]);
		mockAgents.runReflector.mockResolvedValueOnce([newRef]);
		const entries = [rawMessage("raw-1", "aaaaaaaa")];
		const { fire, runLaunchedWork, getMemoryAppends } = setup({ entries });

		fire();
		await runLaunchedWork();

		expect(mockAgents.runObserver).toHaveBeenCalled();
		expect(mockAgents.runReflector).toHaveBeenCalledWith(expect.objectContaining({ observations: [obsA] }));
		expect(getMemoryAppends()).toEqual([
			{ customType: OM_OBSERVATIONS_RECORDED, data: { observations: [obsA], coversUpToId: "raw-1" } },
			{ customType: OM_REFLECTIONS_RECORDED, data: { reflections: [newRef], coversUpToId: "raw-1" } },
		]);
	});

	it("runs reflector-only and appends non-empty reflections", async () => {
		const newRef = reflection("ffffffffffff", ["aaaaaaaaaaaa"]);
		mockAgents.runReflector.mockResolvedValueOnce([newRef]);
		const entries = [
			rawMessage("raw-1", "aaaaaaaa"),
			observationsRecordedEntry("om-obs", { observations: [obsA], coversUpToId: "raw-1" }),
			rawMessage("raw-2", "bbbbbbbb"),
			observationsDroppedEntry("om-drop", { observationIds: ["bbbbbbbbbbbb"], coversUpToId: "raw-2" }),
		];
		const { fire, runLaunchedWork, pi } = setup({ entries, observeEveryMessages: 999 });

		fire();
		await runLaunchedWork();

		expect(mockAgents.runReflector).toHaveBeenCalledWith(expect.objectContaining({ observations: [obsA], maxTurns: 9, thinkingLevel: "minimal" }));
		expect(pi.appendEntry).toHaveBeenCalledWith(OM_REFLECTIONS_RECORDED, { reflections: [newRef], coversUpToId: "raw-1" });
	});

	it("counts follow-up flags toward the reflector threshold", async () => {
		mockAgents.runReflector.mockResolvedValueOnce([]);
		const entries = [
			rawMessage("raw-1", "aaaaaaaa"),
			observationsRecordedEntry("om-obs", { observations: [obsA], coversUpToId: "raw-1" }),
			reflectionsRecordedEntry("om-ref", { reflections: [reflection("eeeeeeeeeeee", ["aaaaaaaaaaaa"])], coversUpToId: "raw-1" }),
			observationsFlaggedEntry("om-flag", { observationIds: ["aaaaaaaaaaaa"], reason: "Reflection omitted exact error path." }),
		];
		const { fire, runLaunchedWork } = setup({ entries, observeEveryMessages: 999, reflectEveryObservations: 1 });

		fire();
		await runLaunchedWork();

		expect(mockAgents.runReflector).toHaveBeenCalledWith(expect.objectContaining({
			observations: [obsA],
			flaggedObservations: [{ observation: obsA, reasons: ["Reflection omitted exact error path."] }],
		}));
	});

	it("does not count follow-up flags already covered by reflector review", async () => {
		const entries = [
			rawMessage("raw-1", "aaaaaaaa"),
			observationsRecordedEntry("om-obs", { observations: [obsA], coversUpToId: "raw-1" }),
			observationsFlaggedEntry("om-flag", { observationIds: ["aaaaaaaaaaaa"], reason: "Reflection omitted exact error path." }),
			reflectionsReviewedEntry("om-reviewed", { coversUpToId: "raw-1" }),
		];
		const { fire, runLaunchedWork } = setup({ entries, observeEveryMessages: 999, reflectEveryObservations: 1 });

		fire();
		await runLaunchedWork();

		expect(mockAgents.runReflector).not.toHaveBeenCalled();
	});

	it("does not run reflector for follow-up flags below the reflector threshold", async () => {
		const entries = [
			rawMessage("raw-1", "aaaaaaaa"),
			observationsRecordedEntry("om-obs", { observations: [obsA], coversUpToId: "raw-1" }),
			reflectionsRecordedEntry("om-ref", { reflections: [reflection("eeeeeeeeeeee", ["aaaaaaaaaaaa"])], coversUpToId: "raw-1" }),
			observationsFlaggedEntry("om-flag", { observationIds: ["aaaaaaaaaaaa"], reason: "Reflection omitted exact error path." }),
		];
		const { fire, runLaunchedWork } = setup({ entries, observeEveryMessages: 999, reflectEveryObservations: 2 });

		fire();
		await runLaunchedWork();

		expect(mockAgents.runReflector).not.toHaveBeenCalled();
	});

	it("runs curator after reflection output and advances the curator cursor", async () => {
		const newRef = reflection("ffffffffffff", ["aaaaaaaaaaaa"]);
		mockAgents.runReflector.mockResolvedValueOnce([newRef]);
		mockAgents.runCurator.mockResolvedValueOnce({ pinned: [], unpinned: [], flagged: [], dropped: [] });
		const entries = [
			rawMessage("raw-1", "aaaaaaaa"),
			observationsRecordedEntry("om-obs", { observations: [obsA], coversUpToId: "raw-1" }),
			rawMessage("raw-2", "bbbbbbbb"),
		];
		const { fire, runLaunchedWork, getMemoryAppends } = setup({ entries, observeEveryMessages: 999 });

		fire();
		await runLaunchedWork();

		expect(mockAgents.runReflector).toHaveBeenCalled();
		expect(mockAgents.runCurator).toHaveBeenCalledWith(expect.objectContaining({ reflections: [newRef], observations: [obsA], candidateObservationIds: ["aaaaaaaaaaaa"] }));
		expect(getMemoryAppends()).toEqual([
			{ customType: OM_REFLECTIONS_RECORDED, data: { reflections: [newRef], coversUpToId: "raw-1" } },
			{ customType: OM_OBSERVATIONS_CURATED, data: { coversUpToId: "raw-1" } },
		]);
	});

	it("does not launch only because the old active observation pool threshold is exceeded", async () => {
		const entries = [
			rawMessage("raw-1", "aaaaaaaa"),
			observationsRecordedEntry("om-obs", { observations: [obsA], coversUpToId: "raw-1" }),
			reflectionsReviewedEntry("om-reviewed", { coversUpToId: "raw-1" }),
		];
		const { fire, runLaunchedWork, runtime } = setup({ entries, observeEveryMessages: 999, reflectEveryObservations: 999 });

		fire();
		await runLaunchedWork();

		expect(runtime.launchMemoryUpdateTask).not.toHaveBeenCalled();
		expect(mockAgents.runCurator).not.toHaveBeenCalled();
	});

	it("runs reflector before curator and appends curator drops through reflection coverage", async () => {
		const newRef = reflection("ffffffffffff", ["bbbbbbbbbbbb"]);
		mockAgents.runReflector.mockResolvedValueOnce([newRef]);
		mockAgents.runCurator.mockResolvedValueOnce({ pinned: [], unpinned: [], flagged: [], dropped: ["bbbbbbbbbbbb"] });
		const entries = [
			rawMessage("raw-1", "aaaaaaaa"),
			observationsRecordedEntry("om-obs-a", { observations: [obsA], coversUpToId: "raw-1" }),
			rawMessage("raw-2", "bbbbbbbb"),
			observationsRecordedEntry("om-obs-b", { observations: [obsB], coversUpToId: "raw-2" }),
		];
		const { fire, runLaunchedWork, getMemoryAppends } = setup({ entries, observeEveryMessages: 999 });

		fire();
		await runLaunchedWork();

		expect(mockAgents.runCurator).toHaveBeenCalledWith(expect.objectContaining({ reflections: [newRef], candidateObservationIds: ["aaaaaaaaaaaa", "bbbbbbbbbbbb"] }));
		expect(getMemoryAppends()).toEqual([
			{ customType: OM_REFLECTIONS_RECORDED, data: { reflections: [newRef], coversUpToId: "raw-2" } },
			{ customType: OM_OBSERVATIONS_DROPPED, data: { observationIds: ["bbbbbbbbbbbb"], coversUpToId: "raw-2" } },
			{ customType: OM_OBSERVATIONS_CURATED, data: { coversUpToId: "raw-2" } },
		]);
	});

	it("does not run curator from existing reflections without same-run reflection work", async () => {
		const ref = reflection("eeeeeeeeeeee", ["aaaaaaaaaaaa"]);
		const entries = [
			rawMessage("raw-1", "aaaaaaaa"),
			observationsRecordedEntry("om-obs", { observations: [obsA], coversUpToId: "raw-1" }),
			reflectionsRecordedEntry("om-ref", { reflections: [ref], coversUpToId: "raw-1" }),
			rawMessage("raw-2", "bbbbbbbb"),
		];
		const { fire, runLaunchedWork, getMemoryAppends } = setup({ entries, observeEveryMessages: 999, reflectEveryObservations: 1 });

		fire();
		await runLaunchedWork();

		expect(mockAgents.runReflector).not.toHaveBeenCalled();
		expect(mockAgents.runCurator).not.toHaveBeenCalled();
		expect(getMemoryAppends()).toEqual([]);
	});

	it("appends reflection review marker and runs curator without empty drop entries", async () => {
		mockAgents.runReflector.mockResolvedValueOnce([]);
		const entries = [rawMessage("raw-1", "aaaaaaaa"), observationsRecordedEntry("om-obs", { observations: [obsA], coversUpToId: "raw-1" })];
		const { fire, runLaunchedWork, pi, ctx } = setup({ entries, observeEveryMessages: 999 });

		fire();
		await runLaunchedWork();

		expect(pi.appendEntry).toHaveBeenCalledWith(OM_REFLECTIONS_REVIEWED, { coversUpToId: "raw-1" });
		expect(mockAgents.runCurator).toHaveBeenCalledWith(expect.objectContaining({ candidateObservationIds: ["aaaaaaaaaaaa"] }));
	});

	it("preserves stage failure boundaries", async () => {
		mockAgents.runObserver.mockRejectedValueOnce(new Error("observe failed"));
		const observerFailure = setup({ entries: [rawMessage("raw-1", "aaaaaaaa")] });
		observerFailure.fire();
		await observerFailure.runLaunchedWork();
		expect(observerFailure.runtime.lastObserverError).toBe("observe failed");
		expect(mockAgents.runReflector).not.toHaveBeenCalled();

		mockAgents.runObserver.mockReset();
		mockAgents.runObserver.mockResolvedValue(undefined);
		mockAgents.runReflector.mockReset();
		mockAgents.runReflector.mockRejectedValueOnce(new Error("reflect failed"));
		const reflectorFailure = setup({ entries: [rawMessage("raw-1", "aaaaaaaa"), observationsRecordedEntry("om-obs", { observations: [obsA], coversUpToId: "raw-1" })], observeEveryMessages: 999 });
		reflectorFailure.fire();
		await reflectorFailure.runLaunchedWork();
		expect(reflectorFailure.runtime.lastReflectorError).toBe("reflect failed");
		expect(mockAgents.runCurator).not.toHaveBeenCalled();
		expect(reflectorFailure.getMemoryAppends()).toEqual([]);

		mockAgents.runReflector.mockReset();
		const newRef = reflection("ffffffffffff", ["aaaaaaaaaaaa"]);
		mockAgents.runReflector.mockResolvedValueOnce([newRef]);
		mockAgents.runCurator.mockReset();
		mockAgents.runCurator.mockRejectedValueOnce(new Error("curate failed"));
		const curatorFailure = setup({ entries: [rawMessage("raw-1", "aaaaaaaa"), observationsRecordedEntry("om-obs", { observations: [obsA], coversUpToId: "raw-1" })], observeEveryMessages: 999 });
		curatorFailure.fire();
		await curatorFailure.runLaunchedWork();
		expect(curatorFailure.runtime.lastCuratorError).toBe("curate failed");
		expect(curatorFailure.getMemoryAppends()).toEqual([
			{ customType: OM_REFLECTIONS_RECORDED, data: { reflections: [newRef], coversUpToId: "raw-1" } },
		]);
	});
});
