import type { AgentToolResult } from "@earendil-works/pi-agent-core";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";

import observationalMemory from "../src/index.js";
import {
	RECALL_OBSERVATION_TOOL_NAME,
	formatRecallCallForTui,
	formatRecallRenderedResultForTui,
	recallObservationTool,
	registerRecallTool,
	type RecallObservationToolDetails,
} from "../src/tools/recall.js";
import { toolApi } from "./fixtures/pi.js";
import {
	observation,
	observationsRecordedEntry,
	rawMessage,
	reflection,
	reflectionsRecordedEntry,
	type TestEntry,
} from "./fixtures/session.js";

function fakeCtx(entries: TestEntry[]) {
	const getBranch = vi.fn(() => entries);
	const getEntries = vi.fn(() => {
		throw new Error("recall tool must not use getEntries");
	});
	return { ctx: { sessionManager: { getBranch, getEntries } } as unknown as ExtensionContext, getBranch, getEntries };
}

async function execute(id: string, entries: TestEntry[], params: Record<string, unknown> = {}) {
	const { ctx, getBranch, getEntries } = fakeCtx(entries);
	const result = await recallObservationTool.execute("tool-1", { id, ...params }, undefined, undefined, ctx) as AgentToolResult<RecallObservationToolDetails>;
	const text = result.content.filter((part): part is { type: "text"; text: string } => part.type === "text").map((part) => part.text).join("\n");
	return { result, text, getBranch, getEntries };
}

describe("recall tool", () => {
	it("keeps the public tool name, typed-id schema, and TUI call rendering", () => {
		const pi = toolApi();
		registerRecallTool(pi);

		expect(RECALL_OBSERVATION_TOOL_NAME).toBe("recall");
		expect(recallObservationTool.name).toBe("recall");
		expect(recallObservationTool.label).toBe("Recall memory evidence");
		expect((recallObservationTool.parameters as any).properties.id.pattern).toBe("^(?:[a-f0-9]{12}|obs_[a-f0-9]{12}|ref_[a-f0-9]{12})$");
		expect((recallObservationTool.parameters as any).properties.includeIntermediate).toBeTruthy();
		expect((recallObservationTool.parameters as any).properties.depth).toBeTruthy();
		expect(formatRecallCallForTui("obs_aaaaaaaaaaaa")).toBe("recall obs_aaaaaaaaaaaa");
		expect(pi.registerTool).toHaveBeenCalledWith(recallObservationTool);
	});

	it("registers the canonical recall tool from the extension entrypoint", () => {
		const pi = {
			registerTool: vi.fn(),
			registerCommand: vi.fn(),
			on: vi.fn(),
		} as any;

		observationalMemory(pi);

		expect(pi.registerTool).toHaveBeenCalledWith(recallObservationTool);
	});

	it("renders active observation source evidence", async () => {
		const obs = observation("aaaaaaaaaaaa", { content: "User likes tea.", sourceEntryIds: ["raw-1"] });
		const entries = [rawMessage("raw-1", "I like tea."), observationsRecordedEntry("om-obs", { observations: [obs], coversUpToId: "raw-1" })];

		const { result, text, getBranch, getEntries } = await execute("aaaaaaaaaaaa", entries);

		expect(getBranch).toHaveBeenCalledOnce();
		expect(getEntries).not.toHaveBeenCalled();
		expect(result.details?.status).toBe("ok");
		expect(result.details?.matches[0].observation.status).toBe("active");
		expect(text).toContain("I like tea.");
		expect(formatRecallRenderedResultForTui(result, false)).toContain("✓ observation");
	});

	it("renders reflection recall with supporting observations and sources", async () => {
		const obs = observation("aaaaaaaaaaaa", { content: "User likes tea.", sourceEntryIds: ["raw-1"] });
		const ref = reflection("eeeeeeeeeeee", ["aaaaaaaaaaaa"], { content: "User likes tea." });
		const entries = [
			rawMessage("raw-1", "I like tea."),
			observationsRecordedEntry("om-obs", { observations: [obs], coversUpToId: "raw-1" }),
			reflectionsRecordedEntry("om-ref", { reflections: [ref], coversUpToId: "om-obs" }),
		];

		const { result, text } = await execute("eeeeeeeeeeee", entries);

		expect(result.details?.status).toBe("ok");
		expect(result.details?.reflections).toHaveLength(1);
		expect(result.details?.observations).toHaveLength(1);
		expect(text).toContain("Reflections:");
		expect(text).toContain("[ref_eeeeeeeeeeee] User likes tea.");
		expect(text).toContain("Provenance:");
		expect(text).toContain("ref_eeeeeeeeeeee -> obs_aaaaaaaaaaaa");
		expect(text).toContain("Observations:");
		expect(text).toContain("Sources:");
		expect(text).toContain("I like tea.");
	});

	it("can include intermediate reflection content", async () => {
		const obs = observation("aaaaaaaaaaaa", { content: "User likes tea.", sourceEntryIds: ["raw-1"] });
		const parent = reflection("dddddddddddd", ["aaaaaaaaaaaa"], { content: "User likes tea." });
		const child = reflection("eeeeeeeeeeee", ["ref_dddddddddddd"], { content: "User beverage preference is tea." });
		const entries = [
			rawMessage("raw-1", "I like tea."),
			observationsRecordedEntry("om-obs", { observations: [obs], coversUpToId: "raw-1" }),
			reflectionsRecordedEntry("om-ref-1", { reflections: [parent], coversUpToId: "om-obs" }),
			reflectionsRecordedEntry("om-ref-2", { reflections: [child], coversUpToId: "om-ref-1" }),
		];

		const compact = await execute("ref_eeeeeeeeeeee", entries);
		const expanded = await execute("ref_eeeeeeeeeeee", entries, { includeIntermediate: true });

		expect(compact.text).not.toContain("Supporting reflections:");
		expect(compact.result.details?.supportingReflections.map((item) => item.id)).toEqual(["ref_dddddddddddd"]);
		expect(compact.text).toContain("ref_eeeeeeeeeeee -> ref_dddddddddddd");
		expect(expanded.text).toContain("Supporting reflections:");
		expect(expanded.text).toContain("[ref_dddddddddddd] User likes tea.");
	});

	it("reports missing sources as partial", async () => {
		const obs = observation("aaaaaaaaaaaa", { sourceEntryIds: ["missing-raw"] });
		const entries = [observationsRecordedEntry("om-obs", { observations: [obs], coversUpToId: "om-obs" })];

		const { result, text } = await execute("aaaaaaaaaaaa", entries);

		expect(result.details?.status).toBe("partial");
		expect(result.details?.missingSourceEntryIds).toEqual(["missing-raw"]);
		expect(text).toContain("missing: missing-raw");
	});

	it("reports invalid ids without reading the branch", async () => {
		const { result, text, getBranch } = await execute("not-valid", []);

		expect(result.details?.status).toBe("invalid_id");
		expect(text).toContain("Memory id must be a typed obs_* or ref_* id");
		expect(getBranch).not.toHaveBeenCalled();
	});

});
