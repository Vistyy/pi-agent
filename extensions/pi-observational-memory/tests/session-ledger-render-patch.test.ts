import { describe, expect, it } from "vitest";

import { renderMemoryPatch } from "../src/session-ledger/index.js";
import { observation, reflection } from "./fixtures/session.js";

describe("session-ledger memory patch rendering", () => {
	it("renders exact observations with ids", () => {
		const low = observation("aaaaaaaaaaaa", { content: "Routine acknowledgement." });
		const exact = observation("bbbbbbbbbbbb", {
			event: {
				title: "Typecheck failed",
				details: ["Command: npm run typecheck", "Error: TS2322 at src/config.ts:47"],
				status: "unresolved",
			},
		});

		const patch = renderMemoryPatch([], [low, exact], { maxTokens: 200 });

		expect(patch).toContain("Observational memory exact-detail patch");
		expect(patch).toContain("[bbbbbbbbbbbb]");
		expect(patch).toContain("Command: npm run typecheck");
		expect(patch).toContain("[aaaaaaaaaaaa]");
	});

	it("caps patch output by token budget", () => {
		const first = observation("aaaaaaaaaaaa", { content: "User said exact detail A must be preserved." });
		const second = observation("bbbbbbbbbbbb", { content: "User said exact detail B must be preserved." });

		const patch = renderMemoryPatch([], [first, second], { maxTokens: 80 });

		expect(patch).toContain("[aaaaaaaaaaaa]");
		expect(patch).not.toContain("[bbbbbbbbbbbb]");
	});

	it("includes reflections when budget allows", () => {
		const ref = reflection("eeeeeeeeeeee", ["aaaaaaaaaaaa"], { content: "User prefers exact source-backed memory." });

		const patch = renderMemoryPatch([ref], [], { maxTokens: 100 });

		expect(patch).toContain("### Reflections");
		expect(patch).toContain("[eeeeeeeeeeee] User prefers exact source-backed memory.");
	});
});
