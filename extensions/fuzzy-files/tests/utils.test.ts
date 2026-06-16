import { describe, expect, it } from "vitest";
import { extractAtToken, withTrailingSlash } from "../src/utils.js";

describe("utils", () => {
	it("extracts the active @ token", () => {
		expect(extractAtToken("open @src/fo")).toBe("src/fo");
		expect(extractAtToken("@README.md")).toBe("README.md");
		expect(extractAtToken("open @src file")).toBeUndefined();
		expect(extractAtToken("email@host")).toBeUndefined();
	});

	it("adds one trailing slash", () => {
		expect(withTrailingSlash("src")).toBe("src/");
		expect(withTrailingSlash("src/")).toBe("src/");
	});
});
