import { describe, expect, it, vi } from "vitest";

import { registerStatusCommand } from "../src/commands/status.js";
import type { Runtime } from "../src/runtime.js";
import {
	compactionEntry,
	memoryDetails,
	observation,
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
			reflectEveryObservations: 20,
			observationsPoolMaxTokens: 40,
			dropWhenActiveObservationsOver: 20,
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
	const run = async (commandArgs = "") => {
		await handler(commandArgs, ctx);
		return notify.mock.calls.at(-1)?.[0] as string;
	};
	return { run, notify };
}

describe("/om:status", () => {
	it("renders concise default status", async () => {
		const output = await setup({ entries: [] }).run();

		expect(output).toContain("── Memory ──");
		expect(output).toContain("Context:      0 observations, 0 reflections");
		expect(output).toContain("Next context: 0 observations, 0 reflections");
		expect(output).toContain("Size:         ~0 / 40 tokens");
		expect(output).toContain("Observe: 0 / 10 source entries");
		expect(output).toContain("Reflect: 0 / 20 observations");
		expect(output).not.toContain("Strategy:");
	});

	it("shows context, next context, progress clocks, and total cost", async () => {
		const obs = observation("aaaaaaaaaaaa");
		const ref = reflection("eeeeeeeeeeee", ["aaaaaaaaaaaa"]);
		const entries = [
			textCustomMessage("raw-1", "aaaaaaaa"),
			observationsRecordedEntry("om-obs", { observations: [obs], coversUpToId: "raw-1" }),
			reflectionsRecordedEntry("om-ref", { reflections: [ref], coversUpToId: "raw-1" }),
			textCustomMessage("raw-2", "bbbbbbbb"),
			compactionEntry("cmp", { firstKeptEntryId: "raw-2", details: memoryDetails({ observations: [obs], reflections: [ref] }) }),
		];

		const output = await setup({ entries }).run();

		expect(output).toContain("Context:      0 observations, 1 reflections");
		expect(output).toContain("Next context: 0 observations, 1 reflections");
		expect(output).toContain("Observe: 2 / 10 source entries");
		expect(output).toContain("Reflect: 0 / 20 observations");
		expect(output).toContain("Total: $0.0000 / 0 requests / 0 tokens");
	});

	it("shows full details on request", async () => {
		const obs = observation("aaaaaaaaaaaa");
		const entries = [
			textCustomMessage("raw-1", "aaaaaaaa"),
			observationsRecordedEntry("om-obs", { observations: [obs], coversUpToId: "raw-1" }),
		];

		const output = await setup({ entries }).run("full");

		expect(output).toContain("── Details ──");
		expect(output).toContain("Strategy: replacement");
		expect(output).toContain("Ledger observations: 1 recorded / 0 dropped / 1 active");
		expect(output).toContain("Review state: 0 reviewed / 1 unreviewed");
		expect(output).toContain("Context drift: +1 observations, +0 reflections, -0 stale observations");
		expect(output).toContain("Source entries since review cursor: 1");
	});

	it("rejects unsupported status arguments", async () => {
		const output = await setup({ entries: [] }).run("debug");

		expect(output).toBe("Usage: /om:status [full]");
	});

	it("shows disabled config in full mode, memory update in flight, compaction hook in flight, and stage-specific last errors", async () => {
		const output = await setup({
			entries: [],
			runtime: {
				config: { strategy: "off", observeEveryMessages: 10, reflectEveryObservations: 20, observationsPoolMaxTokens: 40, dropWhenActiveObservationsOver: 20 },
				memoryUpdateInFlight: true,
				memoryUpdatePhase: "reflector",
				compactHookInFlight: true,
				lastObserverError: "observer failed",
				lastReflectorError: "reflect failed",
				lastDropperError: "drop failed",
			},
		}).run("full");

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
