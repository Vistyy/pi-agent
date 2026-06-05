import { describe, expect, it, vi } from "vitest";

import { registerViewCommand } from "../src/commands/view.js";
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

function setup(entries: TestEntry[]) {
	let handler: CommandHandler | undefined;
	const pi = commandApi((name, command) => {
		expect(name).toBe("om:view");
		handler = command.handler;
	});
	const runtime = { ensureConfig: vi.fn() } as Pick<Runtime, "ensureConfig">;
	registerViewCommand(pi, runtime as Runtime);
	if (!handler) throw new Error("view handler not registered");
	const notify = vi.fn();
	const ctx = commandCtx({ cwd: "/tmp/project", ui: { notify }, sessionManager: { getBranch: () => entries } });
	const run = async (args = "") => {
		await handler(args, ctx);
		return { output: notify.mock.calls.at(-1)?.[0] as string };
	};
	return { run, notify };
}

describe("V3 /om:view", () => {
	it("renders no-memory visible output as content-only sections", async () => {
		const { output } = await setup([]).run();
		const expected = [
			"── Reflections ──",
			"No visible reflections.",
			"",
			"── Observations ──",
			"No visible observations.",
		].join("\n");

		expect(output).toBe(expected);
	});

	it("default view renders latest visible om.folded memory content only", async () => {
		const obs = observation("aaaaaaaaaaaa");
		const ref = reflection("eeeeeeeeeeee", ["aaaaaaaaaaaa"]);
		const entries = [
			textCustomMessage("raw-1", "aaaa"),
			observationsRecordedEntry("om-obs", { observations: [observation("bbbbbbbbbbbb")], coversUpToId: "raw-1" }),
			compactionEntry("cmp", { firstKeptEntryId: "raw-1", details: memoryDetails({ observations: [obs], reflections: [ref] }) }),
		];

		const { output } = await setup(entries).run();

		expect(output).toContain("── Reflections ──");
		expect(output).toContain("[eeeeeeeeeeee] Reflection eeeeeeeeeeee");
		expect(output).toContain("── Observations ──");
		expect(output).toContain("[aaaaaaaaaaaa]");
		expect(output).not.toContain("bbbbbbbbbbbb");
	});

	it("full view folds recorded V3 memory and excludes dropped observations", async () => {
		const obsA = observation("aaaaaaaaaaaa", { content: "Dropped observation content" });
		const obsB = observation("bbbbbbbbbbbb", { content: "Kept observation content" });
		const ref = reflection("eeeeeeeeeeee", ["bbbbbbbbbbbb"]);
		const entries = [
			textCustomMessage("raw-1", "aaaa"),
			oldV2ObservationEntry("v2-obs"),
			compactionEntry("cmp-v2", { firstKeptEntryId: "raw-1", details: oldV2CompactionDetails() }),
			observationsRecordedEntry("om-obs", { observations: [obsA, obsB], coversUpToId: "raw-1" }),
			reflectionsRecordedEntry("om-ref", { reflections: [ref], coversUpToId: "om-obs" }),
			observationsDroppedEntry("om-drop", { observationIds: ["aaaaaaaaaaaa"], coversUpToId: "om-ref" }),
		];

		const { output } = await setup(entries).run("full");

		expect(output).toContain("── Reflections ──");
		expect(output).toContain("[eeeeeeeeeeee] Reflection eeeeeeeeeeee");
		expect(output).toContain("── Observations ──");
		expect(output).toContain("[bbbbbbbbbbbb]");
		expect(output).toContain("Kept observation content");
		expect(output).not.toContain("[aaaaaaaaaaaa]");
		expect(output).not.toContain("Dropped observation content");
	});

	it("full view renders recorded empty states", async () => {
		const { output } = await setup([]).run("full");
		const expected = [
			"── Reflections ──",
			"No recorded reflections.",
			"",
			"── Observations ──",
			"No recorded observations.",
		].join("\n");

		expect(output).toBe(expected);
	});

	it("rejects unsupported view arguments", async () => {
		const { output } = await setup([]).run("diff");

		expect(output).toBe("Usage: /om:view [full]");
	});
});
