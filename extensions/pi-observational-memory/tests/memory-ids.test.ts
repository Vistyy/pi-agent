import { describe, expect, it } from "vitest";
import {
	isLegacyMemoryId,
	isObservationId,
	isReflectionId,
	isRewriteId,
	memoryIdKind,
	observationId,
	reflectionId,
	rewriteId,
	untypedMemoryId,
} from "../src/memory/ids.js";

describe("memory ids", () => {
	it("normalizes legacy ids to typed ids", () => {
		expect(observationId("abcdef123456")).toBe("obs_abcdef123456");
		expect(reflectionId("abcdef123456")).toBe("ref_abcdef123456");
		expect(rewriteId("abcdef123456")).toBe("rw_abcdef123456");
	});

	it("keeps already typed ids unchanged", () => {
		expect(observationId("obs_abcdef123456")).toBe("obs_abcdef123456");
		expect(reflectionId("ref_abcdef123456")).toBe("ref_abcdef123456");
		expect(rewriteId("rw_abcdef123456")).toBe("rw_abcdef123456");
	});

	it("validates and routes typed ids", () => {
		expect(isLegacyMemoryId("abcdef123456")).toBe(true);
		expect(isObservationId("obs_abcdef123456")).toBe(true);
		expect(isReflectionId("ref_abcdef123456")).toBe(true);
		expect(isRewriteId("rw_abcdef123456")).toBe(true);
		expect(memoryIdKind("obs_abcdef123456")).toBe("observation");
		expect(memoryIdKind("ref_abcdef123456")).toBe("reflection");
		expect(memoryIdKind("rw_abcdef123456")).toBe("rewrite");
		expect(memoryIdKind("abcdef123456")).toBeUndefined();
	});

	it("strips typed memory prefixes", () => {
		expect(untypedMemoryId("obs_abcdef123456")).toBe("abcdef123456");
		expect(untypedMemoryId("ref_abcdef123456")).toBe("abcdef123456");
		expect(untypedMemoryId("rw_abcdef123456")).toBe("abcdef123456");
		expect(untypedMemoryId("abcdef123456")).toBe("abcdef123456");
	});
});
