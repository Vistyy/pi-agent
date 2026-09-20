import { lookup as nodeLookup } from "node:dns/promises";
import { isIP } from "node:net";
import { randomBytes } from "node:crypto";

const EXA = "https://api.exa.ai";
const SEARCH_BUDGET = 3_000;
const DIRECT_HOSTS = new Set(["raw.githubusercontent.com", "api.github.com"]);
const MAX_API_BYTES = 2_000_000;
const MAX_DIRECT_BYTES = 1_000_000;
const MAX_EXA_TEXT_CHARS = 200_000;
const MAX_CACHE_CHARS = 1_000_000;
const MAX_CACHE_ENTRIES = 16;

export type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;
export type ResolveHost = (host: string) => Promise<string[]>;
export type ToolResult = { content: [{ type: "text"; text: string }]; details: Record<string, unknown> };
export type FetchInput = {
	url?: string;
	question?: string;
	contentRef?: string;
	offset?: number;
	maxChars?: number;
};

type CacheEntry = { ref: string; url: string; title?: string; text: string; source: string; warning?: string };
type Citation = { url: string; title?: string };

export class WebAccessError extends Error {}
class NonFallbackExaError extends WebAccessError {}

function chars(value: string): string[] { return Array.from(value); }
function charLength(value: string): number { return chars(value).length; }
function take(value: string, count: number): string { return chars(value).slice(0, count).join(""); }
function cleanText(value: unknown): string {
	return typeof value === "string" ? value.replaceAll("\u0000", "").replace(/\r\n?/g, "\n").trim() : "";
}
function cleanInline(value: unknown): string {
	return cleanText(value).replace(/\s+/g, " ");
}
function looksBinary(value: string): boolean {
	const sample = value.slice(0, 8_192);
	if (sample.includes("\u0000")) return true;
	let controls = 0;
	for (const character of sample) {
		const code = character.codePointAt(0)!;
		if (code < 32 && character !== "\n" && character !== "\r" && character !== "\t") controls++;
	}
	return sample.length > 0 && controls / sample.length > 0.01;
}
function abortError(): Error { return new DOMException("The operation was cancelled", "AbortError"); }
function isAbort(error: unknown): boolean { return error instanceof Error && error.name === "AbortError"; }

function combinedSignal(parent: AbortSignal | undefined, timeoutMs: number): { signal: AbortSignal; cleanup: () => void; timedOut: () => boolean } {
	const controller = new AbortController();
	let timeout = false;
	const timer = setTimeout(() => { timeout = true; controller.abort(); }, timeoutMs);
	const cancel = () => controller.abort();
	if (parent?.aborted) controller.abort();
	else parent?.addEventListener("abort", cancel, { once: true });
	return {
		signal: controller.signal,
		cleanup: () => { clearTimeout(timer); parent?.removeEventListener("abort", cancel); },
		timedOut: () => timeout,
	};
}

async function readBounded(response: Response, maxBytes: number, signal: AbortSignal): Promise<string> {
	const declared = Number(response.headers.get("content-length"));
	if (Number.isFinite(declared) && declared > maxBytes) throw new WebAccessError("Remote response is too large.");
	if (!response.body) return "";
	const reader = response.body.getReader();
	const chunks: Uint8Array[] = [];
	let size = 0;
	try {
		while (true) {
			if (signal.aborted) throw abortError();
			const { done, value } = await reader.read();
			if (done) break;
			size += value.byteLength;
			if (size > maxBytes) throw new WebAccessError("Remote response is too large.");
			chunks.push(value);
		}
	} finally {
		if (signal.aborted || size > maxBytes) await reader.cancel().catch(() => undefined);
	}
	const bytes = new Uint8Array(size);
	let offset = 0;
	for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
	try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
	catch { throw new WebAccessError("Remote response is not valid UTF-8 text."); }
}

function safeMessage(error: unknown): string {
	if (isAbort(error)) return "Cancelled.";
	if (error instanceof WebAccessError) return error.message;
	return "The remote service could not be reached. Check connectivity and try again.";
}

function httpError(status: number, service: string): WebAccessError {
	if (status === 401 || status === 403) return new WebAccessError(`${service} rejected the credential. Check EXA_API_KEY.`);
	if (status === 402) return new WebAccessError(`${service} requires payment or available credits.`);
	if (status === 429) return new WebAccessError(`${service} rate limit reached. Retry later.`);
	return new WebAccessError(`${service} request failed (HTTP ${status}).`);
}

function privateV4(ip: string): boolean {
	const p = ip.split(".").map(Number);
	return p[0] === 0 || p[0] === 10 || p[0] === 127 || p[0] === 169 && p[1] === 254 ||
		p[0] === 172 && p[1]! >= 16 && p[1]! <= 31 || p[0] === 192 && (p[1] === 0 || p[1] === 168) ||
		p[0] === 100 && p[1]! >= 64 && p[1]! <= 127 || p[0] === 198 && (p[1] === 18 || p[1] === 19 || p[1] === 51 && p[2] === 100) ||
		p[0] === 203 && p[1] === 0 && p[2] === 113 || p[0]! >= 224;
}
function privateAddress(address: string): boolean {
	const normalized = address.toLowerCase().split("%")[0]!;
	if (isIP(normalized) === 4) return privateV4(normalized);
	if (isIP(normalized) !== 6) return true;
	if (normalized === "::" || normalized === "::1" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("ff") ||
		normalized.startsWith("fe8") || normalized.startsWith("fe9") || normalized.startsWith("fea") || normalized.startsWith("feb") ||
		normalized.startsWith("fec") || normalized.startsWith("fed") || normalized.startsWith("fee") || normalized.startsWith("fef") ||
		normalized.startsWith("2001:db8:")) return true;
	const embedded = normalized.match(/::(?:ffff:)?(\d+\.\d+\.\d+\.\d+)$/)?.[1];
	if (embedded) return privateV4(embedded);
	const mappedHex = normalized.match(/::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
	if (mappedHex) {
		const high = Number.parseInt(mappedHex[1]!, 16), low = Number.parseInt(mappedHex[2]!, 16);
		return privateV4(`${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`);
	}
	return false;
}

export function normalizePublicUrl(raw: string): string {
	let url: URL;
	try { url = new URL(raw); } catch { throw new WebAccessError("URL must be a valid public HTTP(S) URL."); }
	if (url.protocol !== "http:" && url.protocol !== "https:") throw new WebAccessError("URL must use HTTP or HTTPS.");
	if (url.username || url.password) throw new WebAccessError("URLs containing credentials are not allowed.");
	const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
	if (!host || host === "localhost" || isIP(host) === 0 && (!host.includes(".") || [".localhost", ".local", ".localdomain", ".internal", ".lan", ".home.arpa"].some((suffix) => host.endsWith(suffix))) || privateAddress(host) && isIP(host) !== 0) {
		throw new WebAccessError("Local and private network URLs are not allowed.");
	}
	url.hostname = host;
	url.hash = "";
	if (url.port === "80" && url.protocol === "http:" || url.port === "443" && url.protocol === "https:") url.port = "";
	return url.toString();
}

function citationUrl(raw: unknown): string | undefined {
	if (typeof raw !== "string" || raw.length > 2_000) return undefined;
	try {
		const normalized = normalizePublicUrl(raw);
		return normalized.length <= 2_000 ? normalized : undefined;
	} catch { return undefined; }
}

async function defaultResolve(host: string): Promise<string[]> {
	if (isIP(host)) return [host];
	return (await nodeLookup(host, { all: true, verbatim: true })).map((item) => item.address);
}

async function assertPublicResolution(url: string, resolveHost: ResolveHost): Promise<void> {
	const host = new URL(url).hostname.replace(/^\[|\]$/g, "");
	let addresses: string[];
	try { addresses = await resolveHost(host); }
	catch { throw new WebAccessError("Could not resolve the URL hostname."); }
	if (addresses.length === 0 || addresses.some(privateAddress)) throw new WebAccessError("The URL resolves to a local or private network address.");
}

function parseJson(text: string, service: string): any {
	try { return JSON.parse(text); }
	catch { throw new WebAccessError(`${service} returned an invalid response.`); }
}

function exaResultError(result: any): string | undefined {
	const topLevelError = cleanInline(result?.error);
	if (topLevelError) return "provider reported an error";
	const status = result?.status;
	if (typeof status === "string" && !["success", "completed"].includes(status.toLowerCase())) return `status ${status}`;
	if (status && typeof status === "object") {
		const value = typeof status.status === "string" ? status.status.toLowerCase() : "";
		if (status.error || value && !["success", "completed"].includes(value)) return value ? `status ${value}` : "provider reported an error";
	}
	return undefined;
}

function exaContentsIssue(data: any, item: any): string | undefined {
	const status = Array.isArray(data?.statuses) ? data.statuses[0] : undefined;
	return exaResultError(status) || exaResultError(item) || (!item ? "missing per-URL result" : undefined);
}

function fitSearch(answer: string, citations: Array<Citation | undefined>): string {
	const unique: Citation[] = [];
	const sourceByUrl = new Map<string, number>();
	const remap = new Map<number, number>();
	for (const [index, citation] of citations.entries()) {
		if (!citation) continue;
		let source = sourceByUrl.get(citation.url);
		if (source === undefined) {
			unique.push(citation);
			source = unique.length;
			sourceByUrl.set(citation.url, source);
		}
		remap.set(index + 1, source);
	}
	const normalizedAnswer = answer.replace(/\[(\d+)\]/g, (_marker, id: string) => {
		const source = remap.get(Number(id));
		return source === undefined ? "" : `[${source}]`;
	});
	for (let count = Math.min(unique.length, 8); count >= 1; count--) {
		const lines = unique.slice(0, count).map((c, i) => `[${i + 1}] ${c.title ? `${take(c.title, 160)} — ` : ""}${c.url}`);
		const suffix = `\n\nSources:\n${lines.join("\n")}`;
		const room = SEARCH_BUDGET - charLength(suffix);
		if (room > 20) {
			const withoutDangling = normalizedAnswer.replace(/\[(\d+)\]/g, (marker, id: string) => Number(id) <= count ? marker : "");
			const fitted = take(withoutDangling, room).replace(/\[\d*$/, "").trimEnd();
			return `${fitted}${suffix}`;
		}
	}
	throw new WebAccessError("Exa returned citations too large to present safely.");
}

function fitSearchResults(results: any[]): string {
	const blocks: string[] = [];
	for (const result of results.slice(0, 5)) {
		const url = citationUrl(result?.url);
		if (!url) continue;
		const title = take(cleanInline(result?.title) || "Untitled", 200);
		const date = take(cleanInline(result?.publishedDate), 80);
		const highlights = Array.isArray(result?.highlights) ? result.highlights : [];
		const extract = cleanInline(highlights.find((x: unknown) => typeof x === "string"));
		blocks.push(`${title}\n${url}${date ? `\nPublished: ${date}` : ""}${extract ? `\n${take(extract, 250)}` : ""}`);
	}
	if (!blocks.length) throw new WebAccessError("Exa search returned no usable public results.");
	let output = "Search results (untrusted web excerpts):\n\n";
	for (const block of blocks) {
		const addition = `${output.endsWith("\n\n") ? "" : "\n\n"}${block}`;
		if (charLength(output + addition) > SEARCH_BUDGET) break;
		output += addition;
	}
	return output.trimEnd();
}

class LruCache {
	private entries = new Map<string, CacheEntry>();
	private total = 0;
	put(entry: CacheEntry): void {
		const size = charLength(entry.text);
		if (size > MAX_CACHE_CHARS) throw new WebAccessError("Fetched representation is too large to cache for continuation.");
		while (this.entries.size >= MAX_CACHE_ENTRIES || this.total + size > MAX_CACHE_CHARS) {
			const oldest = this.entries.keys().next().value as string | undefined;
			if (!oldest) break;
			const removed = this.entries.get(oldest)!;
			this.entries.delete(oldest); this.total -= charLength(removed.text);
		}
		this.entries.set(entry.ref, entry); this.total += size;
	}
	get(ref: string): CacheEntry | undefined {
		const entry = this.entries.get(ref);
		if (!entry) return undefined;
		this.entries.delete(ref); this.entries.set(ref, entry);
		return entry;
	}
	clear(): void { this.entries.clear(); this.total = 0; }
}

export class WebAccessService {
	private cache = new LruCache();
	constructor(private options: { fetch?: FetchLike; resolve?: ResolveHost; apiKey?: () => string | undefined; timeoutMs?: number } = {}) {}
	clear(): void { this.cache.clear(); }
	private get fetcher(): FetchLike { return this.options.fetch ?? fetch; }
	private get resolver(): ResolveHost { return this.options.resolve ?? defaultResolve; }
	private key(): string {
		const configured = this.options.apiKey ? this.options.apiKey() : process.env.EXA_API_KEY;
		const key = configured?.trim();
		if (!key) throw new WebAccessError("Exa credential is missing. Set EXA_API_KEY and retry.");
		return key;
	}

	private async request(url: string, init: RequestInit, signal: AbortSignal | undefined, maxBytes = MAX_API_BYTES): Promise<{ response: Response; text: string }> {
		const linked = combinedSignal(signal, this.options.timeoutMs ?? 15_000);
		try {
			const response = await this.fetcher(url, { ...init, signal: linked.signal });
			const text = await readBounded(response, maxBytes, linked.signal);
			return { response, text };
		} catch (error) {
			if (signal?.aborted) throw abortError();
			if (linked.timedOut()) throw new WebAccessError("Remote request timed out. Try again.");
			throw error;
		} finally { linked.cleanup(); }
	}

	private async exa(path: string, body: unknown, signal?: AbortSignal): Promise<{ response: Response; data: any }> {
		const { response, text } = await this.request(`${EXA}${path}`, {
			method: "POST",
			headers: { "content-type": "application/json", "x-api-key": this.key() },
			body: JSON.stringify(body),
		}, signal);
		let data: any = {};
		if (text.trim()) {
			try { data = JSON.parse(text); }
			catch { if (response.ok) throw new WebAccessError("Exa returned an invalid response."); }
		}
		return { response, data };
	}

	async search(query: string, signal?: AbortSignal): Promise<ToolResult> {
		if (typeof query !== "string" || !query.trim()) throw new WebAccessError("query must be non-empty.");
		if (signal?.aborted) throw abortError();
		let fallbackReason = "unusable answer";
		let answerRequest: string | undefined;
		try {
			const answer = await this.exa("/answer", {
				query: query.trim(),
				systemPrompt: "Answer directly and prefer official primary sources. Cite claims with the supplied sources.",
			}, signal);
			answerRequest = cleanInline(answer.data?.requestId) || undefined;
			if ([401, 402, 403, 429].includes(answer.response.status)) throw new NonFallbackExaError(httpError(answer.response.status, "Exa").message);
			if (!answer.response.ok) {
				if (answer.response.status < 500 && answer.response.status !== 408) throw new NonFallbackExaError(httpError(answer.response.status, "Exa").message);
				fallbackReason = `answer HTTP ${answer.response.status}`;
			} else {
				const text = cleanText(answer.data?.answer);
				const citations: Array<Citation | undefined> = (Array.isArray(answer.data?.citations) ? answer.data.citations : [])
					.map((item: any) => {
						const url = citationUrl(typeof item === "string" ? item : item?.url);
						return url ? { url, title: cleanInline(item?.title) || undefined } : undefined;
					});
				if (text && citations.some(Boolean)) return {
					content: [{ type: "text", text: fitSearch(text, citations) }],
					details: { backend: "exa-answer", requestId: answerRequest, cost: answer.data?.costDollars, fallback: false },
				};
			}
		} catch (error) {
			if (isAbort(error) || signal?.aborted) throw abortError();
			if (error instanceof NonFallbackExaError || error instanceof WebAccessError && /credential|payment|rate limit/i.test(error.message)) throw error;
			fallbackReason = safeMessage(error);
		}

		try {
			const search = await this.exa("/search", {
				query: query.trim(), numResults: 5,
				contents: { highlights: { query: query.trim(), maxCharacters: 500 } },
			}, signal);
			if (!search.response.ok) throw httpError(search.response.status, "Exa search fallback");
			return {
				content: [{ type: "text", text: fitSearchResults(search.data?.results ?? []) }],
				details: { backend: "exa-search", requestId: search.data?.requestId, cost: search.data?.costDollars, fallback: true, fallbackReason, answerRequestId: answerRequest },
			};
		} catch (error) {
			if (isAbort(error) || signal?.aborted) throw abortError();
			throw new WebAccessError(`Exa answer was unavailable (${fallbackReason}); search fallback also failed: ${safeMessage(error)}`);
		}
	}

	async webFetch(input: FetchInput, signal?: AbortSignal): Promise<ToolResult> {
		const hasUrl = typeof input.url === "string";
		const hasRef = typeof input.contentRef === "string";
		if (hasUrl === hasRef) throw new WebAccessError("Provide either url for a new fetch or contentRef with offset for continuation.");
		if (hasUrl && input.offset !== undefined) throw new WebAccessError("offset is only valid with contentRef continuation.");
		if (hasRef && (input.question !== undefined || input.offset === undefined)) throw new WebAccessError("Continuation requires contentRef and offset, without url or question.");
		const maxChars = input.maxChars ?? (input.question !== undefined ? 4_000 : 6_000);
		if (!Number.isInteger(maxChars) || maxChars < 1_000 || maxChars > 30_000) throw new WebAccessError("maxChars must be an integer from 1000 to 30000.");
		if (hasRef) return this.continue(input.contentRef!, input.offset!, maxChars);
		if (input.question !== undefined && !input.question.trim()) throw new WebAccessError("question must be non-empty when provided.");
		if (signal?.aborted) throw abortError();
		const url = normalizePublicUrl(input.url!);
		await assertPublicResolution(url, this.resolver);
		if (signal?.aborted) throw abortError();
		const direct = githubDirectUrl(url);
		if (direct) return this.direct(url, direct.url, direct.source, maxChars, input.question?.trim(), signal);
		if (input.question !== undefined) return this.focused(url, input.question.trim(), maxChars, signal);
		return this.broad(url, maxChars, signal);
	}

	private async focused(url: string, question: string, budget: number, signal?: AbortSignal): Promise<ToolResult> {
		const result = await this.exa("/contents", {
			urls: [url], highlights: { query: question, maxCharacters: Math.min(8_000, budget * 2) }, maxAgeHours: 0,
		}, signal);
		if (!result.response.ok) throw httpError(result.response.status, "Exa Contents");
		const item = result.data?.results?.[0];
		const issue = exaContentsIssue(result.data, item);
		if (issue) throw new WebAccessError(`Exa could not fetch this URL: ${issue}.`);
		const highlights = (Array.isArray(item.highlights) ? item.highlights : []).map(cleanText).filter(Boolean);
		const title = cleanInline(item.title) || undefined;
		if (!highlights.length) {
			return fitFetchOutput("No focused highlights were returned. Call web_fetch with {url} and no question for a broad fetch.", budget,
				{ mode: "selected-highlights", url, title });
		}
		return fitFetchOutput(highlights.join("\n\n"), budget, { mode: "selected-highlights", url, title });
	}

	private async broad(url: string, budget: number, signal?: AbortSignal): Promise<ToolResult> {
		const result = await this.exa("/contents", {
			urls: [url], text: { maxCharacters: MAX_EXA_TEXT_CHARS }, maxAgeHours: 0,
		}, signal);
		if (!result.response.ok) throw httpError(result.response.status, "Exa Contents");
		const item = result.data?.results?.[0];
		const issue = exaContentsIssue(result.data, item);
		if (issue) throw new WebAccessError(`Exa could not fetch this URL: ${issue}.`);
		const text = cleanText(item.text);
		if (!text) throw new WebAccessError("Exa returned an empty broad representation for this URL.");
		const warning = charLength(text) >= MAX_EXA_TEXT_CHARS ? "Exa may have truncated this representation at its 200000-character extraction limit." : undefined;
		return this.storeAndFormat(text, url, cleanInline(item.title) || undefined, "exa-text", budget, warning);
	}

	private async direct(requestedUrl: string, fetchUrl: string, source: string, budget: number, question?: string, signal?: AbortSignal): Promise<ToolResult> {
		let current = fetchUrl;
		for (let redirects = 0; redirects <= 3; redirects++) {
			await assertPublicResolution(current, this.resolver);
			if (!DIRECT_HOSTS.has(new URL(current).hostname)) throw new WebAccessError("GitHub direct fetch redirected outside recognized exact-content hosts.");
			const { response, text } = await this.request(current, { redirect: "manual", headers: { accept: source === "github-api" ? "application/vnd.github+json" : "text/plain" } }, signal, MAX_DIRECT_BYTES);
			if (response.status >= 300 && response.status < 400) {
				const location = response.headers.get("location");
				if (!location) throw new WebAccessError("GitHub returned an invalid redirect.");
				current = normalizePublicUrl(new URL(location, current).toString());
				continue;
			}
			if (!response.ok) throw new WebAccessError(`GitHub exact-content fetch failed (HTTP ${response.status}).`);
			const type = response.headers.get("content-type")?.toLowerCase() ?? "";
			if (source !== "github-api" && (type.startsWith("image/") || type.startsWith("audio/") || type.startsWith("video/") || looksBinary(text))) throw new WebAccessError("GitHub content is binary and cannot be returned as text.");
			let body = text;
			if (source === "github-api") {
				const json = parseJson(text, "GitHub API");
				if (json && !Array.isArray(json) && json.encoding === "base64" && typeof json.content === "string") {
					try {
						const encoded = json.content.replace(/\s/g, "");
						if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) throw new Error("invalid base64");
						body = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.from(encoded, "base64"));
					} catch { throw new WebAccessError("GitHub Contents payload is not valid UTF-8 text."); }
				} else body = JSON.stringify(json, null, 2);
			}
			if (looksBinary(body)) throw new WebAccessError("GitHub content is binary and cannot be returned as text.");
			body = cleanText(body);
			if (!body) throw new WebAccessError("GitHub returned empty content.");
			if (question) {
				const selected = selectFocusedText(body, question);
				const evidence = selected || "No focused passages matched. Call web_fetch with {url} and no question for a broad fetch.";
				return fitFetchOutput(evidence, budget, { mode: "selected-highlights", url: requestedUrl, source });
			}
			return this.storeAndFormat(body, requestedUrl, undefined, source, budget);
		}
		throw new WebAccessError("GitHub exact-content fetch exceeded the redirect limit.");
	}

	private storeAndFormat(text: string, url: string, title: string | undefined, source: string, budget: number, warning?: string): ToolResult {
		const ref = randomBytes(12).toString("base64url");
		const result = fitFetchOutput(text, budget, { mode: "broad-text", url, title, source, warning }, ref);
		if (result.details.contentRef) this.cache.put({ ref, url, title, text, source, warning });
		return result;
	}

	private continue(ref: string, offset: number, budget: number): ToolResult {
		if (!ref || !Number.isInteger(offset) || offset < 0) throw new WebAccessError("Continuation requires contentRef and a non-negative integer offset.");
		const entry = this.cache.get(ref);
		if (!entry) throw new WebAccessError("contentRef is expired or unknown; fetch the URL again.");
		const total = charLength(entry.text);
		if (offset > total) throw new WebAccessError(`offset ${offset} is beyond the ${total}-character representation.`);
		return fitFetchOutput(entry.text, budget, { mode: "broad-text", url: entry.url, title: entry.title, source: entry.source, warning: entry.warning }, ref, offset);
	}
}

function selectFocusedText(text: string, question: string): string {
	const allTerms = question.toLocaleLowerCase().match(/[\p{L}\p{N}]{2,}/gu) ?? [];
	const stopWords = new Set(["and", "are", "for", "from", "how", "is", "that", "the", "this", "was", "what", "when", "where", "which", "who", "why", "with"]);
	const terms = [...new Set(allTerms.filter((term) => !stopWords.has(term)))];
	const usefulTerms = terms.length ? terms : [...new Set(allTerms)];
	if (!usefulTerms.length) return "";
	let passages = text.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
	if (passages.length === 1) passages = text.split("\n").map((part) => part.trim()).filter(Boolean);
	const selected = passages
		.map((passage, index) => {
			const words = new Set(passage.toLocaleLowerCase().match(/[\p{L}\p{N}]{2,}/gu) ?? []);
			const score = usefulTerms.reduce((total, term) => total + (words.has(term) ? 1 : 0), 0);
			return { passage, index, score };
		})
		.filter((item) => item.score > 0)
		.sort((a, b) => b.score - a.score || a.index - b.index)
		.slice(0, 5)
		.sort((a, b) => a.index - b.index)
		.map((item) => take(item.passage, 2_500));
	return selected.join("\n\n");
}

function githubDirectUrl(url: string): { url: string; source: string } | undefined {
	const parsed = new URL(url);
	if (parsed.hostname === "raw.githubusercontent.com") return { url, source: "github-raw" };
	if (parsed.hostname === "api.github.com") return { url, source: "github-api" };
	if (parsed.hostname !== "github.com") return undefined;
	const match = parsed.pathname.match(/^\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)$/);
	if (!match) return undefined;
	return { url: `https://raw.githubusercontent.com/${match[1]}/${match[2]}/${match[3]}/${match[4]}${parsed.search}`, source: "github-blob" };
}

function fitFetchOutput(
	text: string,
	budget: number,
	metadata: { mode: string; url: string; title?: string; source?: string; warning?: string },
	ref?: string,
	offset = 0,
): ToolResult {
	const all = chars(text);
	const total = all.length;
	let amount = Math.max(0, Math.min(total - offset, budget));
	const format = (count: number): string => {
		const end = offset + count;
		const complete = end >= total;
		const header = `${metadata.title ? `Title: ${metadata.title}\n` : ""}URL: ${metadata.url}\nContent: untrusted web data\nMode: ${metadata.mode}${metadata.mode === "selected-highlights" ? " (selected evidence; not exhaustive or snapshot-stable)" : " (complete only for this normalized representation)"}\nCharacters: ${offset}-${end} of ${total}\n${metadata.warning ? `Warning: ${metadata.warning}\n` : ""}`;
		const next = !complete && ref ? `\nNext: web_fetch({contentRef:${JSON.stringify(ref)}, offset:${end}})` : "";
		return `${header}\n${all.slice(offset, end).join("")}${next}`;
	};
	for (let i = 0; i < 8; i++) {
		const rendered = format(amount);
		const bodyLength = amount;
		const overhead = charLength(rendered) - bodyLength;
		const nextAmount = Math.max(0, Math.min(total - offset, budget - overhead));
		if (nextAmount === amount) break;
		amount = nextAmount;
	}
	const end = offset + amount;
	const complete = end >= total;
	const output = format(amount);
	if (charLength(output) > budget) throw new WebAccessError("Requested character budget is too small for fetch metadata.");
	const resumable = Boolean(ref) && end < total;
	return {
		content: [{ type: "text", text: output }],
		details: {
			...metadata,
			complete: metadata.mode === "selected-highlights" ? false : complete,
			contentRef: resumable ? ref : undefined,
			range: { start: offset, end },
			representationChars: total,
			nextOffset: resumable ? end : undefined,
		},
	};
}

export function errorResult(error: unknown): never {
	if (isAbort(error)) throw error;
	throw new WebAccessError(safeMessage(error));
}
