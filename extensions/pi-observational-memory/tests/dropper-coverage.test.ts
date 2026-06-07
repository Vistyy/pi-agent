import { describe, expect, it } from "vitest";

import {
	observationToMemoryAgentLine,
	reflectionCoverageMap,
	reflectionCoverageTierForCount,
	summarizeCoverage,
	summarizeCoverageTransitions,
} from "../src/agents/coverage.js";
import { observation, reflection } from "./fixtures/session.js";

describe("reflection coverage helpers", () => {
	it("maps support counts to deterministic coverage tiers", () => {
		expect(reflectionCoverageTierForCount(0)).toBe("none");
		expect(reflectionCoverageTierForCount(1)).toBe("partial");
		expect(reflectionCoverageTierForCount(2)).toBe("strong");
		expect(reflectionCoverageTierForCount(10)).toBe("strong");
	});

	it("computes none, partial, and strong coverage from reflection support ids", () => {
		const none = observation("aaaaaaaaaaaa");
		const partial = observation("bbbbbbbbbbbb");
		const strong = observation("cccccccccccc");
		const coverage = reflectionCoverageMap([none, partial, strong], [
			reflection("rrrrrrrrrrr1", ["bbbbbbbbbbbb", "cccccccccccc"]),
			reflection("rrrrrrrrrrr2", ["cccccccccccc"]),
		]);

		expect(coverage.get("aaaaaaaaaaaa")).toBe("none");
		expect(coverage.get("bbbbbbbbbbbb")).toBe("partial");
		expect(coverage.get("cccccccccccc")).toBe("strong");
	});

	it("summarizes coverage counts and token totals", () => {
		const observations = [
			observation("aaaaaaaaaaaa", { tokenCount: 3 }),
			observation("bbbbbbbbbbbb", { tokenCount: 5 }),
			observation("cccccccccccc", { tokenCount: 7 }),
		];
		const coverage = reflectionCoverageMap(observations, [
			reflection("rrrrrrrrrrr1", ["bbbbbbbbbbbb", "cccccccccccc"]),
			reflection("rrrrrrrrrrr2", ["cccccccccccc"]),
		]);

		expect(summarizeCoverage(observations, coverage)).toEqual({
			none: { count: 1, tokens: 3 },
			partial: { count: 1, tokens: 5 },
			strong: { count: 1, tokens: 7 },
		});
	});

	it("summarizes coverage transitions without exposing ids", () => {
		const observations = [
			observation("aaaaaaaaaaaa", { tokenCount: 3 }),
			observation("bbbbbbbbbbbb", { tokenCount: 5 }),
			observation("cccccccccccc", { tokenCount: 7 }),
		];
		const before = reflectionCoverageMap(observations, [
			reflection("rrrrrrrrrrr1", ["bbbbbbbbbbbb"]),
		]);
		const after = reflectionCoverageMap(observations, [
			reflection("rrrrrrrrrrr1", ["aaaaaaaaaaaa", "bbbbbbbbbbbb", "cccccccccccc"]),
			reflection("rrrrrrrrrrr2", ["bbbbbbbbbbbb", "cccccccccccc"]),
		]);

		expect(summarizeCoverageTransitions(observations, before, after)).toEqual({
			"none->partial": { count: 1, tokens: 3 },
			"partial->strong": { count: 1, tokens: 5 },
			"none->strong": { count: 1, tokens: 7 },
		});
	});

	it("renders model-facing observation lines with coverage evidence only", () => {
		const line = observationToMemoryAgentLine(
			observation("aaaaaaaaaaaa", { content: "Important fact" }),
			"strong",
		);

		expect(line).toContain("[aaaaaaaaaaaa]");
		expect(line).toContain("[coverage: strong]");
		expect(line).toContain("Important fact");
	});
});
