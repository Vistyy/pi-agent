import { describe, expect, it } from "vitest";
import { extractSearchToken, withTrailingSlash } from "../src/utils.js";

describe("utils", () => {
	it("extracts project and global search tokens", () => {
		expect(extractSearchToken("open @src/fo")).toEqual({ scope: "project", marker: "@", query: "src/fo" });
		expect(extractSearchToken("@@README.md")).toEqual({ scope: "global", marker: "@@", query: "README.md" });
		expect(extractSearchToken("open @src file")).toBeUndefined();
		expect(extractSearchToken("email@host")).toBeUndefined();
		expect(extractSearchToken("@@@src")).toBeUndefined();
	});

	it("adds one trailing slash", () => {
		expect(withTrailingSlash("src")).toBe("src/");
		expect(withTrailingSlash("src/")).toBe("src/");
	});
});
