import { describe, expect, it } from "vitest";

import { renderRecallSourceEntry, serializeObserverSourceEntries } from "../src/memory/serialize.js";

describe("memory serialization", () => {
	it("keeps user prompts and omits assistant thinking from observer input", () => {
		const { text } = serializeObserverSourceEntries([
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
		] as any);

		expect(text).toContain("Remember the exact flag --unsafe-fast.");
		expect(text).toContain("[non-text content omitted]");
		expect(text).toContain("I will use --unsafe-fast.");
		expect(text).toContain("[thinking omitted]");
		expect(text).not.toContain("Maybe this is irrelevant");
	});

	it("renders tool results as compact evidence excerpts", () => {
		const output = `HEAD-${"a".repeat(9000)}-TAIL`;
		const { text } = serializeObserverSourceEntries([
			{
				type: "message",
				id: "tool-1",
				timestamp: "2026-05-02T10:00:00.000Z",
				message: { role: "toolResult", timestamp: 1777716000000, toolName: "bash", isError: true, content: [{ type: "text", text: output }] },
			},
		] as any);

		expect(text).toContain("[Tool evidence: bash @");
		expect(text).toContain("status: error");
		expect(text).toContain("excerpt:");
		expect(text).toContain("HEAD-");
		expect(text).toContain("-TAIL");
		expect(text).toContain("[truncated middle");
		expect(text.length).toBeLessThan(output.length);
	});

	it("renders bash execution and compaction summaries as observer sources", () => {
		const { text, sourceEntryIds } = serializeObserverSourceEntries([
			{
				type: "message",
				id: "bash-1",
				timestamp: "2026-05-02T10:00:00.000Z",
				message: { role: "bashExecution", timestamp: 1777716000000, command: "npm test", output: "failed at exact needle", exitCode: 1, truncated: false },
			},
			{
				type: "compaction",
				id: "cmp-1",
				timestamp: "2026-05-02T10:02:00.000Z",
				firstKeptEntryId: "bash-1",
				tokensBefore: 12345,
				summary: "Earlier decision: keep model A.",
			},
		] as any);

		expect(sourceEntryIds).toEqual(["bash-1", "cmp-1"]);
		expect(text).toContain("[Tool evidence: bash @");
		expect(text).toContain("command: npm test");
		expect(text).toContain("exitCode: 1");
		expect(text).toContain("excerpt:");
		expect(text).toContain("failed at exact needle");
		expect(text).toContain("[Compaction summary @");
		expect(text).toContain("first kept: bash-1");
		expect(text).toContain("Earlier decision: keep model A.");
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
