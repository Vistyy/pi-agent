import { describe, expect, it } from "vitest";
import { rankEntries, type SearchEntry } from "../src/search.js";

const entry = (display: string, isDirectory = false): SearchEntry => ({
	absPath: `/repo/${display}`,
	display,
	isDirectory,
});

describe("rankEntries", () => {
	it("returns entries in scan order for empty queries", () => {
		const results = rankEntries([entry("src", true), entry("README.md"), entry("src/main.ts")], "", 10);
		expect(results.map((item) => item.display)).toEqual(["src", "README.md", "src/main.ts"]);
	});

	it("uses fzf matching against display paths", () => {
		const results = rankEntries([
			entry("packages/app/src/components/Button.tsx"),
			entry("docs/button-guide.md"),
			entry("src/Button.tsx"),
		], "src button", 3);

		expect(results.map((item) => item.display)).toEqual([
			"src/Button.tsx",
			"packages/app/src/components/Button.tsx",
		]);
	});

	it("does not apply a manual directory boost", () => {
		const results = rankEntries([entry("docs.md"), entry("docs", true)], "docs", 2);
		expect(results.map((item) => item.display)).toEqual(["docs.md", "docs"]);
	});
});
