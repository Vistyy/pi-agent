import { describe, expect, it, vi, beforeEach } from "vitest";

const mockRunCurator = vi.hoisted(() => vi.fn());
vi.mock("../src/agents/curator/agent.js", () => ({ runCurator: mockRunCurator }));

import { runCuratorStage } from "../src/memory-update/curator-stage.js";
import { Runtime } from "../src/runtime.js";
import {
	OM_OBSERVATIONS_CURATED,
	OM_OBSERVATIONS_DROPPED,
	OM_OBSERVATIONS_FLAGGED,
	OM_OBSERVATIONS_PINNED,
	OM_OBSERVATIONS_RECORDED,
	OM_OBSERVATIONS_UNPINNED,
} from "../src/session-ledger/index.js";
import {
	observation,
	observationsCuratedEntry,
	observationsRecordedEntry,
	reflectionsReviewedEntry,
	textCustomMessage,
	type TestEntry,
} from "./fixtures/session.js";
import { memoryUpdateApi } from "./fixtures/pi.js";

beforeEach(() => {
	mockRunCurator.mockReset();
	mockRunCurator.mockResolvedValue(undefined);
});

function setup(entries: TestEntry[]) {
	let branch = [...entries];
	const appendEntry = vi.fn((customType: string, data: unknown) => {
		branch = [...branch, { type: "custom", id: `appended-${appendEntry.mock.calls.length}`, parentId: branch.at(-1)?.id ?? null, timestamp: "2026-05-02T10:00:00.000Z", customType, data }];
	});
	const runtime = new Runtime();
	runtime.config = { ...runtime.config, protectRecentObservations: 0, agentMaxTurns: 3, curatorThinking: "high" };
	const resolveModel = vi.fn(async () => ({ ok: true as const, model: { reasoning: true }, apiKey: "key", headers: { h: "v" } }));
	const ctx = {
		cwd: "/tmp/om-test",
		hasUI: false,
		model: {},
		modelRegistry: {},
		sessionManager: { getBranch: () => branch },
	};
	return { pi: memoryUpdateApi({}, appendEntry), runtime, ctx, resolveModel, appendEntry };
}

describe("runCuratorStage", () => {
	it("waits until observations have reflection review coverage", async () => {
		const entries = [
			textCustomMessage("raw-1", "remember this"),
			observationsRecordedEntry("om-obs", { observations: [observation("aaaaaaaaaaaa", { sourceEntryIds: ["raw-1"] })], coversUpToId: "raw-1" }),
		];
		const { pi, runtime, ctx, resolveModel, appendEntry } = setup(entries);

		await expect(runCuratorStage(pi as any, runtime, ctx, resolveModel)).resolves.toBe("continue");

		expect(resolveModel).not.toHaveBeenCalled();
		expect(mockRunCurator).not.toHaveBeenCalled();
		expect(appendEntry).not.toHaveBeenCalled();
	});

	it("passes only reviewed observations after the curator cursor as action candidates", async () => {
		const oldObs = observation("aaaaaaaaaaaa", { sourceEntryIds: ["raw-1"], content: "Old reviewed fact" });
		const newObs = observation("bbbbbbbbbbbb", { sourceEntryIds: ["raw-2"], content: "New reviewed fact" });
		const entries = [
			textCustomMessage("raw-1", "old"),
			observationsRecordedEntry("om-old", { observations: [oldObs], coversUpToId: "raw-1" }),
			observationsCuratedEntry("om-curated", { coversUpToId: "raw-1" }),
			textCustomMessage("raw-2", "new"),
			observationsRecordedEntry("om-new", { observations: [newObs], coversUpToId: "raw-2" }),
			reflectionsReviewedEntry("om-reviewed", { coversUpToId: "raw-2" }),
		];
		const { pi, runtime, ctx, resolveModel } = setup(entries);

		await runCuratorStage(pi as any, runtime, ctx, resolveModel);

		expect(resolveModel).toHaveBeenCalledWith("curator");
		expect(mockRunCurator).toHaveBeenCalledOnce();
		expect(mockRunCurator.mock.calls[0][0]).toMatchObject({
			candidateObservationIds: ["bbbbbbbbbbbb"],
			contextObservations: [oldObs],
			pinnedObservationIds: [],
			flaggedObservationIds: [],
			maxDropsAllowed: 1,
		});
	});

	it("appends curator actions and advances the curator cursor", async () => {
		const obs = observation("aaaaaaaaaaaa", { sourceEntryIds: ["raw-1"] });
		const entries = [
			textCustomMessage("raw-1", "durable"),
			observationsRecordedEntry("om-obs", { observations: [obs], coversUpToId: "raw-1" }),
			reflectionsReviewedEntry("om-reviewed", { coversUpToId: "raw-1" }),
		];
		mockRunCurator.mockResolvedValue({
			pinned: [{ observationIds: ["aaaaaaaaaaaa"], reason: "Keep exact detail." }],
			unpinned: [{ observationIds: ["bbbbbbbbbbbb"], reason: "No longer needed." }],
			flagged: [{ observationIds: ["aaaaaaaaaaaa"], reason: "Needs better reflection." }],
			dropped: ["cccccccccccc"],
		});
		const { pi, runtime, ctx, resolveModel, appendEntry } = setup(entries);

		await runCuratorStage(pi as any, runtime, ctx, resolveModel);

		expect(appendEntry.mock.calls.map((call) => call[0])).toEqual([
			OM_OBSERVATIONS_PINNED,
			OM_OBSERVATIONS_UNPINNED,
			OM_OBSERVATIONS_FLAGGED,
			OM_OBSERVATIONS_DROPPED,
			OM_OBSERVATIONS_CURATED,
		]);
		expect(appendEntry).toHaveBeenCalledWith(OM_OBSERVATIONS_DROPPED, { observationIds: ["cccccccccccc"], coversUpToId: "raw-1" });
		expect(appendEntry).toHaveBeenCalledWith(OM_OBSERVATIONS_CURATED, { coversUpToId: "raw-1" });
	});

	it("does not advance the cursor when the curator has no tool output", async () => {
		const entries = [
			textCustomMessage("raw-1", "durable"),
			observationsRecordedEntry("om-obs", { observations: [observation("aaaaaaaaaaaa", { sourceEntryIds: ["raw-1"] })], coversUpToId: "raw-1" }),
			reflectionsReviewedEntry("om-reviewed", { coversUpToId: "raw-1" }),
		];
		const { pi, runtime, ctx, resolveModel, appendEntry } = setup(entries);

		await runCuratorStage(pi as any, runtime, ctx, resolveModel);

		expect(mockRunCurator).toHaveBeenCalledOnce();
		expect(appendEntry).not.toHaveBeenCalledWith(OM_OBSERVATIONS_CURATED, expect.anything());
	});
});
