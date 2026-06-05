import { describe, expect, it, vi } from "vitest";

import { registerStatusCommand } from "../src/commands/status.js";
import type { Runtime } from "../src/runtime.js";
import {
	compactionEntry,
	memoryDetails,
	observation,
	observationsDroppedEntry,
	observationsRecordedEntry,
	oldV2CompactionDetails,
	oldV2ObservationEntry,
	reflection,
	reflectionsRecordedEntry,
	textCustomMessage,
	type TestEntry,
} from "./fixtures/session.js";
import { commandApi, commandCtx, type CommandHandler } from "./fixtures/pi.js";

function setup(args: { entries: TestEntry[]; runtime?: Partial<Runtime> }) {
	let handler: CommandHandler | undefined;
	const pi = commandApi((name, command) => {
		expect(name).toBe("om:status");
		handler = command.handler;
	});
	const runtime = {
		ensureConfig: vi.fn(),
		config: {
			observeAfterTokens: 10,
			reflectAfterTokens: 20,
			compactAfterTokens: 30,
			observationsPoolMaxTokens: 40,
			observationsPoolTargetTokens: 20,
			passive: false,
		},
		consolidationInFlight: false,
		consolidationPhase: undefined,
		compactInFlight: false,
		compactHookInFlight: false,
		lastObserverError: undefined,
		lastReflectorError: undefined,
		lastDropperError: undefined,
		...args.runtime,
	};
	registerStatusCommand(pi, runtime as Runtime);
	if (!handler) throw new Error("status handler not registered");
	const notify = vi.fn();
	const ctx = commandCtx({ cwd: "/tmp/project", ui: { notify }, sessionManager: { getBranch: () => args.entries } });
	const run = async () => {
		await handler("", ctx);
		return notify.mock.calls.at(-1)?.[0] as string;
	};
	return { run, notify };
}

describe("V3 /om:status", () => {
	it("renders concise no-memory status without V2 committed/pending language", async () => {
		const output = await setup({ entries: [] }).run();

		expect(output).toContain("── Memory ──");
		expect(output).toContain("Observations: 0 recorded / 0 dropped / 0 active / 0 visible");
		expect(output).toContain("Reflections:  0 recorded / 0 visible");
		expect(output).toContain("Next observation:");
		expect(output).toContain("Next compaction:");
	});

	it("reports V3 ledger counts, visible/full drift, and ignores old V2 memory", async () => {
		const obsA = observation("aaaaaaaaaaaa", { tokenCount: 5 });
		const obsB = observation("bbbbbbbbbbbb", { tokenCount: 7 });
		const ref = reflection("eeeeeeeeeeee", ["bbbbbbbbbbbb"], { tokenCount: 3 });
		const entries = [
			textCustomMessage("raw-1", "aaaa"),
			oldV2ObservationEntry("v2-obs"),
			compactionEntry("cmp-v2", { firstKeptEntryId: "raw-1", details: oldV2CompactionDetails() }),
			compactionEntry("cmp-visible", { firstKeptEntryId: "raw-1", details: memoryDetails({ observations: [obsA], reflections: [] }) }),
			observationsRecordedEntry("om-obs", { observations: [obsA, obsB], coversUpToId: "raw-1" }),
			reflectionsRecordedEntry("om-ref", { reflections: [ref], coversUpToId: "om-obs" }),
			observationsDroppedEntry("om-drop", { observationIds: ["aaaaaaaaaaaa"], coversUpToId: "om-ref" }),
		];

		const output = await setup({ entries }).run();

		expect(output).toContain("Observations: 2 recorded / 1 dropped / 1 active / 1 visible +1 -1");
		expect(output).toContain("Reflections:  1 recorded / 0 visible +1");
		expect(output).toContain("Visible observation pool: ~5 / 40 tokens (13%)");
		expect(output).toContain("Active observation pool: ~7 / 20 target tokens (35%)");
	});

	it("shows separate progress clocks, visible pool, active observation pool, and reflection pool", async () => {
		const obs = observation("aaaaaaaaaaaa", { tokenCount: 5 });
		const ref = reflection("eeeeeeeeeeee", ["aaaaaaaaaaaa"], { tokenCount: 3 });
		const entries = [
			textCustomMessage("raw-1", "aaaaaaaa"),
			observationsRecordedEntry("om-obs", { observations: [obs], coversUpToId: "raw-1" }),
			reflectionsRecordedEntry("om-ref", { reflections: [ref], coversUpToId: "raw-1" }),
			textCustomMessage("raw-2", "bbbbbbbb"),
			compactionEntry("cmp", { firstKeptEntryId: "raw-2", details: memoryDetails({ observations: [obs], reflections: [ref] }) }),
		];

		const output = await setup({ entries }).run();

		expect(output).toContain("Next observation:");
		expect(output).toContain("/ 10 tokens");
		expect(output).toContain("Next reflection:");
		expect(output).toContain("/ 20 tokens");
		expect(output).toContain("Next compaction:");
		expect(output).toContain("/ 30 tokens");
		expect(output).toContain("Visible observation pool: ~5 / 40 tokens (13%)");
		expect(output).toContain("Active observation pool: ~5 / 20 target tokens (25%)");
		expect(output).toContain("Reflection pool:         ~3 tokens");
	});

	it("shows over-target active observation pool in the Activity section", async () => {
		const obs = observation("aaaaaaaaaaaa", { tokenCount: 25 });
		const entries = [
			textCustomMessage("raw-1", "aaaaaaaa"),
			observationsRecordedEntry("om-obs", { observations: [obs], coversUpToId: "raw-1" }),
		];

		const output = await setup({ entries }).run();

		expect(output).toContain("Active observation pool: ~25 / 20 target tokens (125%)");
	});

	it("shows passive mode, consolidation in flight, compaction in flight, and stage-specific last errors", async () => {
		const output = await setup({
			entries: [],
			runtime: {
				config: { observeAfterTokens: 10, reflectAfterTokens: 20, compactAfterTokens: 30, observationsPoolMaxTokens: 40, observationsPoolTargetTokens: 20, passive: true },
				consolidationInFlight: true,
				consolidationPhase: "reflector",
				compactInFlight: true,
				compactHookInFlight: true,
				lastObserverError: "observer failed",
				lastReflectorError: "reflect failed",
				lastDropperError: "drop failed",
			},
		}).run();

		expect(output).toContain("Passive: automatic memory workers and auto-compaction disabled");
		expect(output).toContain("Consolidation: running (reflector)");
		expect(output).toContain("Auto-compaction: running");
		expect(output).toContain("Compaction hook: running");
		expect(output).toContain("Observer: observer failed");
		expect(output).toContain("Reflector: reflect failed");
		expect(output).toContain("Dropper: drop failed");
	});

	it("shows consolidation in flight without phase when phase is unavailable", async () => {
		const output = await setup({ entries: [], runtime: { consolidationInFlight: true } }).run();

		expect(output).toContain("Consolidation: running");
		expect(output).not.toContain("Consolidation: running (");
	});
});
