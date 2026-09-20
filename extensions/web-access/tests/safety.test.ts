import { describe, expect, it } from "vitest";
import extension from "../index.ts";
import { WebAccessService, normalizePublicUrl } from "../src/core.ts";

const publicDns = async () => ["93.184.216.34"];

describe("surface and safety", () => {
	it("registers exactly the two lean tools and only a shutdown hook", () => {
		const names: string[] = [];
		const events: string[] = [];
		extension({ registerTool: (tool: any) => names.push(tool.name), on: (event: string) => events.push(event) } as any);
		expect(names).toEqual(["web_search", "web_fetch"]);
		expect(events).toEqual(["session_shutdown"]);
	});

	it.each([
		"file:///etc/passwd", "http://user:pass@example.com", "http://localhost/x", "http://service.local/x",
		"http://127.0.0.1/x", "http://10.2.3.4/x", "http://[::1]/x", "http://[fd00::1]/x",
	])("rejects unsafe initial URL %s", (url) => expect(() => normalizePublicUrl(url)).toThrow(/HTTP|credentials|Local|private/i));

	it("rejects hostnames resolving to private addresses before network submission", async () => {
		let called = false;
		const service = new WebAccessService({ apiKey: () => "key", resolve: async () => ["192.168.1.2"], fetch: async () => { called = true; return new Response(); } });
		await expect(service.webFetch({ url: "https://apparently-public.example" })).rejects.toThrow(/private network address/);
		expect(called).toBe(false);
	});

	it("times out bounded remote requests", async () => {
		const service = new WebAccessService({ apiKey: () => "key", resolve: publicDns, timeoutMs: 5, fetch: async (_url, init) => {
			await new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("timeout", "AbortError")), { once: true }));
			throw new Error("unreachable");
		} });
		await expect(service.search("topic")).rejects.toThrow(/timed out.*fallback also failed|answer was unavailable.*timed out/i);
	});

	it("gives actionable missing credential errors", async () => {
		const service = new WebAccessService({ apiKey: () => undefined, fetch: async () => new Response() });
		await expect(service.search("topic")).rejects.toThrow(/EXA_API_KEY/);
	});
});
