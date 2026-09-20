import { describe, expect, it } from "vitest";
import { WebAccessService } from "../src/core.ts";

const publicDns = async () => ["93.184.216.34"];
function json(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("web_search", () => {
	it("uses one answer call and emits deduplicated citations within 3000 Unicode characters", async () => {
		const calls: Array<{ url: string; body: any }> = [];
		const service = new WebAccessService({ apiKey: () => "secret", resolve: publicDns, fetch: async (url, init) => {
			calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
			return json({ answer: "unsupported [9] " + "😀".repeat(4000), requestId: "req", costDollars: 0.01, citations: [
				{ url: "https://Example.com/a#fragment", title: "A" },
				{ url: "https://example.com/a", title: "duplicate" },
			] });
		} });
		const result = await service.search("current fact");
		expect(calls).toHaveLength(1);
		expect(calls[0]!.url).toContain("/answer");
		expect(Array.from(result.content[0].text).length).toBeLessThanOrEqual(3000);
		expect(result.content[0].text.match(/https:\/\/example.com\/a/g)).toHaveLength(1);
		expect(result.content[0].text).not.toMatch(/\[9\]/);
		expect(result.details.backend).toBe("exa-answer");
	});

	it("renumbers inline markers when citations are invalid or deduplicated", async () => {
		const service = new WebAccessService({ apiKey: () => "secret", fetch: async () => json({
			answer: "Zero [0], primary [1], duplicate [2], invalid [3], secondary [4].",
			citations: [
				{ url: "https://example.com/a" },
				{ url: "https://example.com/a#duplicate" },
				{ url: "file:///invalid" },
				{ url: "https://example.com/b" },
			],
		}) });
		const result = await service.search("topic");
		expect(result.content[0].text).toContain("Zero , primary [1], duplicate [1], invalid , secondary [2].");
		expect(result.content[0].text).not.toContain("[0]");
		expect(result.content[0].text.match(/https:\/\/example\.com\/a/g)).toHaveLength(1);
		expect(result.content[0].text.match(/https:\/\/example\.com\/b/g)).toHaveLength(1);
	});

	it("falls back exactly once with nested highlight options for unusable answers", async () => {
		const calls: Array<{ url: string; body: any }> = [];
		const service = new WebAccessService({ apiKey: () => "secret", fetch: async (url, init) => {
			const body = JSON.parse(String(init?.body)); calls.push({ url: String(url), body });
			if (String(url).endsWith("/answer")) return json({ answer: "answer without citations", citations: [] });
			return json({ requestId: "search", results: [{ title: "Result", url: "https://example.com/x", publishedDate: "2025-01-01", highlights: ["Extract only"] }] });
		} });
		const result = await service.search("topic");
		expect(calls).toHaveLength(2);
		expect(calls[1]!.body).toEqual({ query: "topic", numResults: 5, contents: { highlights: { query: "topic", maxCharacters: 500 } } });
		expect(result.content[0].text).toContain("Extract only");
		expect(result.content[0].text).not.toContain("answer without citations");
	});

	it("falls back once after a retryable answer failure and bounds oversized result fields", async () => {
		let calls = 0;
		const service = new WebAccessService({ apiKey: () => "secret", fetch: async () => {
			calls++;
			if (calls === 1) return json({}, 503);
			return json({ results: [{
				title: "T".repeat(5_000),
				url: `https://example.com/${"u".repeat(1_500)}`,
				highlights: ["H".repeat(5_000)],
			}] });
		} });
		const result = await service.search("topic");
		expect(calls).toBe(2);
		expect(result.details.fallback).toBe(true);
		expect(result.content[0].text).toContain("https://example.com/");
		expect(Array.from(result.content[0].text).length).toBeLessThanOrEqual(3_000);
	});

	it.each([400, 401, 402, 429])("does not fall back after non-retryable HTTP %s", async (status) => {
		let calls = 0;
		const service = new WebAccessService({ apiKey: () => "secret", fetch: async () => { calls++; return json({}, status); } });
		await expect(service.search("topic")).rejects.toThrow(status === 400 ? /HTTP 400/ : status === 401 ? /credential/ : status === 402 ? /payment|credits/ : /rate limit/);
		expect(calls).toBe(1);
	});

	it("never falls back on cancellation", async () => {
		let calls = 0;
		const controller = new AbortController();
		const service = new WebAccessService({ apiKey: () => "secret", fetch: async () => {
			calls++; controller.abort();
			throw new DOMException("cancel", "AbortError");
		} });
		await expect(service.search("topic", controller.signal)).rejects.toMatchObject({ name: "AbortError" });
		expect(calls).toBe(1);
	});

	it("reports both endpoint failures without exposing the key", async () => {
		const service = new WebAccessService({ apiKey: () => "TOP-SECRET", fetch: async () => { throw new Error("TOP-SECRET socket"); } });
		await expect(service.search("topic")).rejects.toThrow(/answer was unavailable.*fallback also failed/i);
		await service.search("topic").catch((error) => expect(String(error)).not.toContain("TOP-SECRET"));
	});
});
