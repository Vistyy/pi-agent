import { describe, expect, it } from "vitest";
import { WebAccessService } from "../src/core.ts";

const publicDns = async () => ["93.184.216.34"];
function json(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
function text(body: string, type = "text/plain"): Response {
	return new Response(body, { headers: { "content-type": type } });
}

describe("web_fetch", () => {
	it("uses selected Exa highlights for focused fetch and broad recovery guidance when empty", async () => {
		const bodies: any[] = [];
		let empty = false;
		const service = new WebAccessService({ apiKey: () => "key", resolve: publicDns, fetch: async (_url, init) => {
			bodies.push(JSON.parse(String(init?.body)));
			return json({ results: [{ title: "Page", highlights: empty ? [] : ["first evidence", "second evidence"] }] });
		} });
		const focused = await service.webFetch({ url: "https://example.com/page", question: "why?" });
		expect(bodies[0]).toMatchObject({ ids: ["https://example.com/page"], highlights: { query: "why?" } });
		expect(focused.content[0].text).toContain("selected evidence; not exhaustive");
		expect(focused.content[0].text).toContain("first evidence");
		expect(focused.details.mode).toBe("selected-highlights");
		empty = true;
		const none = await service.webFetch({ url: "https://example.com/page", question: "missing?" });
		expect(none.content[0].text).toContain("no question for a broad fetch");
	});

	it("uses fresh normalized broad text and continues by Unicode code-point offsets without network", async () => {
		let calls = 0;
		const original = "😀".repeat(7_000) + "END";
		const service = new WebAccessService({ apiKey: () => "key", resolve: publicDns, fetch: async (_url, init) => {
			calls++; expect(JSON.parse(String(init?.body))).toEqual({ ids: ["https://example.com/large"], text: { maxAgeHours: 0 } });
			return json({ results: [{ title: "Large", text: original }] });
		} });
		const first = await service.webFetch({ url: "https://example.com/large", maxChars: 1_000 });
		expect(Array.from(first.content[0].text).length).toBeLessThanOrEqual(1_000);
		expect(first.details.representationChars).toBe(7_003);
		const ref = first.details.contentRef as string;
		const next = first.details.nextOffset as number;
		expect(ref).toBeTruthy();
		const second = await service.webFetch({ contentRef: ref, offset: next, maxChars: 1_000 });
		expect(calls).toBe(1);
		expect((second.details.range as any).start).toBe(next);
		expect(Array.from(second.content[0].text).length).toBeLessThanOrEqual(1_000);
	});

	it("evicts old references from the bounded LRU and clears live references", async () => {
		let n = 0;
		const service = new WebAccessService({ apiKey: () => "key", resolve: publicDns, fetch: async () => json({ results: [{ text: `${n++}:` + "x".repeat(10_000) }] }) });
		const refs: string[] = [];
		for (let i = 0; i < 9; i++) refs.push((await service.webFetch({ url: `https://example.com/${i}`, maxChars: 1_000 })).details.contentRef as string);
		await expect(service.webFetch({ contentRef: refs[0]!, offset: 1_000 })).rejects.toThrow(/expired or unknown/);
		service.clear();
		await expect(service.webFetch({ contentRef: refs[8]!, offset: 1_000 })).rejects.toThrow(/expired or unknown/);
	});

	it("honors per-URL errors despite HTTP 200 and validates maxChars", async () => {
		const service = new WebAccessService({ apiKey: () => "key", resolve: publicDns, fetch: async () => json({ results: [{ status: "error", error: "blocked" }] }) });
		await expect(service.webFetch({ url: "https://example.com" })).rejects.toThrow(/provider reported an error/);
		await expect(service.webFetch({ url: "https://example.com", maxChars: 999 })).rejects.toThrow(/1000 to 30000/);
	});

	it("bypasses Exa for GitHub raw/blob/API content and decodes Contents payloads", async () => {
		const urls: string[] = [];
		const service = new WebAccessService({ apiKey: () => { throw new Error("Exa must not be used"); }, resolve: publicDns, fetch: async (url) => {
			urls.push(String(url));
			if (String(url).includes("api.github.com")) return json({ encoding: "base64", content: Buffer.from("api exact").toString("base64") });
			return text("raw exact");
		} });
		const raw = await service.webFetch({ url: "https://raw.githubusercontent.com/o/r/main/a.txt" });
		const blob = await service.webFetch({ url: "https://github.com/o/r/blob/main/a.txt" });
		const api = await service.webFetch({ url: "https://api.github.com/repos/o/r/contents/a.txt" });
		expect(raw.content[0].text).toContain("raw exact");
		expect(blob.content[0].text).toContain("raw exact");
		expect(api.content[0].text).toContain("api exact");
		expect(urls[1]).toBe("https://raw.githubusercontent.com/o/r/main/a.txt");
		expect(urls).toHaveLength(3);
	});

	it("pretty-prints non-Contents GitHub API JSON and rejects direct binary", async () => {
		let binary = false;
		const service = new WebAccessService({ resolve: publicDns, fetch: async () => binary ? text("\u0000x", "application/octet-stream") : json({ ok: true }) });
		const result = await service.webFetch({ url: "https://api.github.com/repos/o/r" });
		expect(result.content[0].text).toContain('"ok": true');
		binary = true;
		await expect(service.webFetch({ url: "https://raw.githubusercontent.com/o/r/main/image" })).rejects.toThrow(/binary/);
	});
});
