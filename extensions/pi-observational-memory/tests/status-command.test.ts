import { describe, expect, it, vi } from "vitest";

import { registerStatusCommand } from "../src/commands/status.js";
import type { Runtime } from "../src/runtime.js";
import {
	compactionEntry,
	memoryDetails,
	observation,
	observationsDroppedEntry,
	observationsRecordedEntry,
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
			strategy: "replacement",
			observeEveryMessages: 10,
			reflectAfterTokens: 20,
			observationsPoolMaxTokens: 40,
			observationsPoolTargetTokens: 20,
		},
		memoryUpdateInFlight: false,
		memoryUpdatePhase: undefined,
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

describe("/om:status", () => {
	it("renders concise no-memory status", async () => {
		const output = await setup({ entries: [] }).run();

		expect(output).toContain("── Memory ──");
		expect(output).toContain("Observations: 0 recorded / 0 dropped / 0 active / 0 visible");
		expect(output).toContain("Reflections:  0 recorded / 0 visible");
		expect(output).toContain("Next observation:");
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
		expect(output).toContain("/ 10 source entries");
		expect(output).toContain("Next reflection:");
		expect(output).toContain("/ 20 tokens");
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

	it("shows disabled config, memory update in flight, compaction hook in flight, and stage-specific last errors", async () => {
		const output = await setup({
			entries: [],
			runtime: {
				config: { strategy: "off", observeEveryMessages: 10, reflectAfterTokens: 20, observationsPoolMaxTokens: 40, observationsPoolTargetTokens: 20 },
				memoryUpdateInFlight: true,
				memoryUpdatePhase: "reflector",
				compactHookInFlight: true,
				lastObserverError: "observer failed",
				lastReflectorError: "reflect failed",
				lastDropperError: "drop failed",
			},
		}).run();

		expect(output).toContain("Strategy: off");
		expect(output).toContain("Memory update: running (reflector)");
		expect(output).toContain("Compaction hook: running");
		expect(output).toContain("Observer: observer failed");
		expect(output).toContain("Reflector: reflect failed");
		expect(output).toContain("Dropper: drop failed");
	});

	it("shows memory update in flight without phase when phase is unavailable", async () => {
		const output = await setup({ entries: [], runtime: { memoryUpdateInFlight: true } }).run();

		expect(output).toContain("Memory update: running");
		expect(output).not.toContain("Memory update: running (");
	});
});
