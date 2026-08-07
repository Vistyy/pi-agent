import { describe, expect, it, vi } from "vitest";
import { SearchSession, rankEntries, type SearchEntry } from "../src/search.js";

const entry = (display: string, isDirectory = false): SearchEntry => ({
	absPath: `/repo/${display}`,
	display,
	isDirectory,
});

describe("SearchSession", () => {
	it("scans only the current working directory for project search", async () => {
		const pi = { exec: vi.fn(async (..._args: any[]) => ({ code: 0, stdout: "", stderr: "" })) };
		const session = new SearchSession(pi as any, "/tmp/project", vi.fn());

		await session.warm("project");

		expect(pi.exec).toHaveBeenCalledTimes(2);
		expect(pi.exec.mock.calls.map((call) => call[2]?.cwd)).toEqual(["/tmp/project", "/tmp/project"]);
	});
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
