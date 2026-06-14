import { describe, expect, it } from "vitest";

import { serializeObserverSourceEntries, type ObserverToolRenderingOptions } from "../src/memory/serialization/observer.js";
import { renderRecallSourceEntry } from "../src/memory/serialization/recall.js";

const observerToolOptions: ObserverToolRenderingOptions = {
	toolResultSummaryMaxChars: 300,
	toolResultErrorMaxChars: 800,
	toolResultsTotalMaxChars: 4_000,
};

describe("memory serialization", () => {
	it("keeps user prompts and omits assistant thinking from observer input", () => {
		const { text, sourceEntryIds } = serializeObserverSourceEntries([
			{
				type: "message",
				id: "raw-user",
				timestamp: "2026-05-02T10:00:00.000Z",
				message: { role: "user", timestamp: 1777716000000, content: [{ type: "text", text: "Remember the exact flag --unsafe-fast." }, { type: "image", data: "abc", mimeType: "image/png" }] },
			},
			{
				type: "message",
				id: "raw-assistant",
				timestamp: "2026-05-02T10:01:00.000Z",
				message: { role: "assistant", timestamp: 1777716060000, content: [{ type: "thinking", thinking: "Maybe this is irrelevant." }, { type: "text", text: "I will use --unsafe-fast." }] },
			},
		] as any, observerToolOptions);

		expect(sourceEntryIds).toEqual(["raw-user", "raw-assistant"]);
		expect(text).toContain("Remember the exact flag --unsafe-fast.");
		expect(text).toContain("[non-text content omitted]");
		expect(text).toContain("I will use --unsafe-fast.");
		expect(text).toContain("[thinking omitted]");
		expect(text).not.toContain("Maybe this is irrelevant");
	});

	it("renders successful tool results as metadata with bounded excerpts", () => {
		const output = `HEAD-${"a".repeat(9000)}-TAIL`;
		const { text } = serializeObserverSourceEntries([
			{
				type: "message",
				id: "tool-1",
				timestamp: "2026-05-02T10:00:00.000Z",
				message: { role: "toolResult", timestamp: 1777716000000, toolName: "unknown_extension_tool", isError: false, path: "src/foo.ts", content: [{ type: "text", text: output }] },
			},
		] as any, { toolResultSummaryMaxChars: 120, toolResultErrorMaxChars: 800, toolResultsTotalMaxChars: 500 });

		expect(text).toContain("[Tool evidence: unknown_extension_tool @");
		expect(text).toContain("status: ok");
		expect(text).toContain("output_chars:");
		expect(text).toContain("input: src/foo.ts");
		expect(text).toContain("output_omitted: true (truncated_to_120_chars)");
		expect(text).toContain("HEAD-");
		expect(text).toContain("-TAIL");
		expect(text.length).toBeLessThan(output.length);
	});

	it("can omit successful tool output while preserving metadata", () => {
		const { text } = serializeObserverSourceEntries([
			{
				type: "message",
				id: "tool-ok",
				timestamp: "2026-05-02T10:00:00.000Z",
				message: { role: "toolResult", timestamp: 1777716000000, toolName: "edit", isError: false, path: "src/config.ts", content: [{ type: "text", text: "Successfully replaced 1 block in src/config.ts." }] },
			},
		] as any, { toolResultSummaryMaxChars: 0, toolResultErrorMaxChars: 800, toolResultsTotalMaxChars: 500 });

		expect(text).toContain("status: ok");
		expect(text).toContain("input: src/config.ts");
		expect(text).toContain("output_omitted: true (success_output_omitted)");
		expect(text).not.toContain("Successfully replaced");
	});

	it("gives error tool results a larger generic excerpt", () => {
		const output = `ERROR first line\n${"x".repeat(500)}\nFinal stack line`;
		const { text } = serializeObserverSourceEntries([
			{
				type: "message",
				id: "tool-error",
				timestamp: "2026-05-02T10:00:00.000Z",
				message: { role: "toolResult", timestamp: 1777716000000, toolName: "custom_runner", isError: true, content: [{ type: "text", text: output }] },
			},
		] as any, { toolResultSummaryMaxChars: 20, toolResultErrorMaxChars: 700, toolResultsTotalMaxChars: 700 });

		expect(text).toContain("status: error");
		expect(text).toContain("ERROR first line");
		expect(text).toContain("Final stack line");
	});

	it("renders bash execution through the same sanitized tool path", () => {
		const { text, sourceEntryIds } = serializeObserverSourceEntries([
			{
				type: "message",
				id: "bash-1",
				timestamp: "2026-05-02T10:00:00.000Z",
				message: { role: "bashExecution", timestamp: 1777716000000, command: "pnpm test", output: "failed at exact needle", exitCode: 1, truncated: false },
			},
		] as any, observerToolOptions);

		expect(sourceEntryIds).toEqual(["bash-1"]);
		expect(text).toContain("[Tool evidence: bash @");
		expect(text).toContain("status: error");
		expect(text).toContain("input: pnpm test");
		expect(text).toContain("exitCode: 1");
		expect(text).toContain("failed at exact needle");
	});

	it("uses include filtering and excludes derived observer sources", () => {
		const { text, sourceEntryIds } = serializeObserverSourceEntries([
			{
				type: "message",
				id: "user-1",
				timestamp: "2026-05-02T10:00:00.000Z",
				message: { role: "user", content: "Primary user evidence." },
			},
			{ type: "compaction", id: "cmp-1", timestamp: "2026-05-02T10:02:00.000Z", summary: "Derived compaction should not be observed." },
			{ type: "branch_summary", id: "branch-1", timestamp: "2026-05-02T10:03:00.000Z", summary: "Derived branch summary." },
			{ type: "custom_message", id: "custom-1", timestamp: "2026-05-02T10:04:00.000Z", content: "Custom event." },
			{
				type: "message",
				id: "custom-role",
				timestamp: "2026-05-02T10:05:00.000Z",
				message: { role: "custom", content: "Custom message role." },
			},
			{
				type: "message",
				id: "compaction-role",
				timestamp: "2026-05-02T10:06:00.000Z",
				message: { role: "compactionSummary", summary: "Compaction message role." },
			},
		] as any, observerToolOptions);

		expect(sourceEntryIds).toEqual(["user-1"]);
		expect(text).toContain("Primary user evidence.");
		expect(text).not.toContain("Derived compaction");
		expect(text).not.toContain("Derived branch");
		expect(text).not.toContain("Custom event");
		expect(text).not.toContain("Custom message role");
		expect(text).not.toContain("Compaction message role");
	});

	it("keeps head and tail details from large giga-session style tool output", () => {
		const realGigaForkHead = "Now I have a thorough understanding of the full codebase. Here is my triage report. B1. Additive cross-compaction memory gap in src/hooks/additive-context.ts.";
		const realGigaForkTail = "Recommended order: fix compaction gap first, then soften observation cleanup, then add recall evals. End of triage report.";
		const output = `${realGigaForkHead}\n${"middle noise\n".repeat(1000)}${realGigaForkTail}`;
		const { text } = serializeObserverSourceEntries([
			{
				type: "message",
				id: "tool-giga-fork",
				timestamp: "2026-06-11T14:02:00.000Z",
				message: { role: "toolResult", timestamp: 1777716000000, toolName: "fork", isError: false, content: [{ type: "text", text: output }] },
			},
		] as any, { toolResultSummaryMaxChars: 400, toolResultErrorMaxChars: 800, toolResultsTotalMaxChars: 400 });

		expect(text).toContain("output_omitted: true (truncated_to_400_chars)");
		expect(text).toContain("Additive cross-compaction memory gap");
		expect(text).toContain("src/hooks/additive-context.ts");
		expect(text).toContain("fix compaction gap first");
		expect(text).toContain("add recall evals");
		expect((text.match(/middle noise/g) ?? []).length).toBeLessThan(10);
		expect(text.length).toBeLessThan(900);
	});

	it("enforces a total tool excerpt budget across generic tools", () => {
		const { text } = serializeObserverSourceEntries([
			{
				type: "message",
				id: "tool-1",
				timestamp: "2026-05-02T10:00:00.000Z",
				message: { role: "toolResult", timestamp: 1777716000000, toolName: "first", isError: false, content: [{ type: "text", text: "FIRST-" + "a".repeat(200) }] },
			},
			{
				type: "message",
				id: "tool-2",
				timestamp: "2026-05-02T10:01:00.000Z",
				message: { role: "toolResult", timestamp: 1777716060000, toolName: "second", isError: false, content: [{ type: "text", text: "SECOND-" + "b".repeat(200) }] },
			},
		] as any, { toolResultSummaryMaxChars: 80, toolResultErrorMaxChars: 80, toolResultsTotalMaxChars: 80 });

		expect(text).toContain("FIRST-");
		expect(text).toContain("[Tool evidence: second @");
		expect(text).toContain("output_omitted: true (budget_exhausted)");
		expect(text).toContain("[output omitted: observer tool excerpt budget exhausted]");
		expect(text).not.toContain("SECOND-");
	});

	it("keeps recall evidence higher fidelity than observer input", () => {
		const entry = {
			type: "message",
			id: "assistant-1",
			timestamp: "2026-05-02T10:00:00.000Z",
			message: { role: "assistant", timestamp: 1777716000000, content: [{ type: "thinking", thinking: "Internal rationale." }, { type: "text", text: "Visible answer." }] },
		};

		expect(renderRecallSourceEntry(entry as any)).toContain("[thinking: Internal rationale.]");
	});
});
