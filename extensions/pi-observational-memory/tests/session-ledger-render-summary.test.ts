import { describe, expect, it } from "vitest";

import { renderSummary } from "../src/session-ledger/index.js";
import { observation, reflection } from "./fixtures/session.js";

describe("session-ledger summary rendering", () => {
	it("renders empty memory as an empty summary", () => {
		expect(renderSummary([], [])).toBe("");
	});

	it("keeps compacted-memory usage instructions", () => {
		const ref = reflection("eeeeeeeeeeee", ["aaaaaaaaaaaa"], { content: "User prefers source-backed memory." });

		const summary = renderSummary([ref], []);

		expect(summary).toContain("These are condensed memories from earlier in this session.");
		expect(summary).toContain("use the recall tool");
	});

	it("renders reflections with ids", () => {
		const ref = reflection("eeeeeeeeeeee", ["aaaaaaaaaaaa"], { content: "User prefers source-backed memory." });

		const summary = renderSummary([ref], []);

		expect(summary).toContain("## Reflections\n[eeeeeeeeeeee] User prefers source-backed memory.");
	});

	it("renders observations with ids, timestamps, and content", () => {
		const obs = observation("aaaaaaaaaaaa", {
			content: "User confirmed recall should use exact source entry ids.",
			timestamp: "2026-05-02 10:30",
		});

		const summary = renderSummary([], [obs]);

		expect(summary).toContain(
			"## Observations\n[aaaaaaaaaaaa] 2026-05-02 10:30 User confirmed recall should use exact source entry ids.",
		);
	});

	it("renders event observations with exact details and status", () => {
		const obs = observation("aaaaaaaaaaaa", {
			event: {
				title: "Typecheck failed",
				details: ["Command: npm run typecheck", "Error: TS2322 at src/config.ts:47"],
				status: "unresolved",
				supersedes: ["bbbbbbbbbbbb"],
			},
		});

		const summary = renderSummary([], [obs]);

		expect(summary).toContain("[aaaaaaaaaaaa]");
		expect(summary).toContain("Typecheck failed");
		expect(summary).toContain("  - Command: npm run typecheck");
		expect(summary).toContain("  - Error: TS2322 at src/config.ts:47");
		expect(summary).toContain("  status: unresolved");
		expect(summary).toContain("  supersedes: bbbbbbbbbbbb");
	});

	it("keeps raw provenance metadata out of the compact summary", () => {
		const obs = observation("aaaaaaaaaaaa", { sourceEntryIds: ["entry-user", "entry-tool"] });
		const ref = reflection("eeeeeeeeeeee", ["aaaaaaaaaaaa"]);

		const summary = renderSummary([ref], [obs]);

		expect(summary).not.toContain("sourceEntryIds");
		expect(summary).not.toContain("supportingObservationIds");
		expect(summary).not.toContain("entry-user");
		expect(summary).not.toContain("entry-tool");
		expect(summary).not.toContain("[object Object]");
	});
});
