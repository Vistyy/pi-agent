import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parseHTML } from "linkedom";
import { Readability } from "@mozilla/readability";
import TurndownService from "turndown";

type SearchProvider = "auto" | "native" | "exa" | "ddg";
type FetchMode = "markdown" | "summary" | "extract";

interface StoredContent {
  id: string;
  url: string;
  title?: string;
  text: string;
  createdAt: number;
  source: string;
}

const MAX_RESULTS_DEFAULT = 6;
const FETCH_MAX_CHARS_DEFAULT = 8000;
const CONTENT = new Map<string, StoredContent>();
const MAX_STORED_ITEMS = 25;
const MAX_STORED_CHARS = 1_000_000;
const turndown = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced" });

function agentFile(name: string) {
  return join(homedir(), ".pi", "agent", name);
}

function readJson(path: string): any | undefined {
  try {
    if (!existsSync(path)) return undefined;
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return undefined;
  }
}

function getAuthEntry(provider: string): any | undefined {
  return readJson(agentFile("auth.json"))?.[provider];
}

function getCodexAuth(): { access: string; accountId?: string; expires?: number } | undefined {
  const entry = getAuthEntry("openai-codex");
  if (entry?.type === "oauth" && typeof entry.access === "string") {
    return { access: entry.access, accountId: entry.accountId, expires: entry.expires };
  }
  return undefined;
}

function getApiKey(provider: string): string | undefined {
  const envByProvider: Record<string, string[]> = {
    openai: ["OPENAI_API_KEY"],
    "openai-codex": ["OPENAI_API_KEY"],
    anthropic: ["ANTHROPIC_API_KEY"],
    google: ["GEMINI_API_KEY", "GOOGLE_API_KEY"],
    xai: ["XAI_API_KEY"],
    zai: ["ZAI_API_KEY"],
    exa: ["EXA_API_KEY"],
  };
  for (const env of envByProvider[provider] ?? []) {
    if (process.env[env]) return process.env[env];
  }
  const entry = getAuthEntry(provider);
  if (entry?.type === "api_key" && typeof entry.key === "string" && !entry.key.startsWith("!")) return entry.key;

  // Optional compatibility with pi-web-access-style config if the user already has it.
  const webConfig = readJson(join(homedir(), ".pi", "web-search.json"));
  if (provider === "exa" && typeof webConfig?.exaApiKey === "string") return webConfig.exaApiKey;
  return undefined;
}

function htmlDecode(s: string) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function truncate(text: string, maxChars = FETCH_MAX_CHARS_DEFAULT) {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + `\n\n[Truncated: ${text.length - maxChars} chars omitted. Use web_content_get for more.]`;
}

function pruneStoredContent() {
  while (CONTENT.size > MAX_STORED_ITEMS) {
    const oldest = [...CONTENT.values()].sort((a, b) => a.createdAt - b.createdAt)[0];
    if (!oldest) break;
    CONTENT.delete(oldest.id);
  }
  let total = [...CONTENT.values()].reduce((n, item) => n + item.text.length, 0);
  while (total > MAX_STORED_CHARS) {
    const oldest = [...CONTENT.values()].sort((a, b) => a.createdAt - b.createdAt)[0];
    if (!oldest) break;
    CONTENT.delete(oldest.id);
    total -= oldest.text.length;
  }
}

function storeContent(url: string, text: string, source: string, title?: string) {
  const id = "web_" + createHash("sha256").update(url + Date.now() + randomUUID()).digest("hex").slice(0, 10);
  CONTENT.set(id, { id, url, title, text, source, createdAt: Date.now() });
  pruneStoredContent();
  return id;
}

function provider(ctx: ExtensionContext) {
  return ctx.model?.provider ?? "";
}
function model(ctx: ExtensionContext) {
  return ctx.model?.id ?? "";
}

async function codexSubscriptionSearch(query: string, signal?: AbortSignal) {
  const auth = getCodexAuth();
  if (!auth) throw new Error("openai-codex OAuth not configured");
  if (auth.expires && Date.now() > auth.expires - 60_000) {
    throw new Error("openai-codex access token is expired or near expiry; refresh by using Codex/pi login, then reload");
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${auth.access}`,
  };
  if (auth.accountId) headers["ChatGPT-Account-ID"] = auth.accountId;

  const res = await fetch("https://chatgpt.com/backend-api/codex/responses", {
    method: "POST",
    signal,
    headers,
    body: JSON.stringify({
      model: "gpt-5.5",
      instructions:
        "Use the web_search tool to search the web. Return compact results with titles, URLs, and brief snippets/citations. Do not add unrelated commentary.",
      input: [
        {
          role: "user",
          content: [{ type: "input_text", text: query }],
        },
      ],
      tools: [{ type: "web_search", external_web_access: true }],
      tool_choice: "auto",
      parallel_tool_calls: true,
      stream: true,
      store: false,
    }),
  });
  if (!res.ok) throw new Error(`Codex subscription search ${res.status}: ${(await res.text()).slice(0, 300)}`);

  const body = await res.text();
  const output: string[] = [];
  const sources: string[] = [];
  for (const block of body.split(/\n\n+/)) {
    const dataLine = block.split("\n").find((line) => line.startsWith("data: "));
    if (!dataLine) continue;
    let event: any;
    try { event = JSON.parse(dataLine.slice(6)); } catch { continue; }
    if (event.type === "response.output_text.delta" && typeof event.delta === "string") output.push(event.delta);
    const item = event.item;
    if (item?.type === "message") {
      for (const c of item.content ?? []) {
        if (typeof c.text === "string") output.push(c.text);
        for (const a of c.annotations ?? []) {
          if (a.type === "url_citation" && a.url) sources.push(`- ${a.title ?? a.url}: ${a.url}`);
        }
      }
    }
  }
  const text = output.join("").trim();
  return (text || "No answer text returned from Codex search.") + (sources.length ? `\n\nSources:\n${[...new Set(sources)].slice(0, 8).join("\n")}` : "");
}

async function openaiSearch(query: string, ctx: ExtensionContext, signal?: AbortSignal) {
  const key = getApiKey(provider(ctx));
  if (!key) throw new Error("OPENAI_API_KEY not configured");
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: model(ctx), tools: [{ type: "web_search" }], input: query }),
  });
  if (!res.ok) throw new Error(`OpenAI search ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data: any = await res.json();
  const parts: string[] = [];
  for (const item of data.output ?? []) {
    if (item.type === "message") for (const c of item.content ?? []) if (c.text) parts.push(c.text);
  }
  return parts.join("\n") || "No results found.";
}

async function anthropicSearch(query: string, ctx: ExtensionContext, signal?: AbortSignal) {
  const key = getApiKey("anthropic");
  if (!key) throw new Error("ANTHROPIC_API_KEY not configured");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: model(ctx), max_tokens: 4096, messages: [{ role: "user", content: query }], tools: [{ type: "web_search_20250305", name: "web_search" }] }),
  });
  if (!res.ok) throw new Error(`Anthropic search ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data: any = await res.json();
  const parts: string[] = [];
  for (const block of data.content ?? []) {
    if (block.type === "text" && block.text) parts.push(block.text);
    if (block.type === "web_search_tool_result") for (const r of block.content ?? []) if (r.url) parts.push(`- ${r.title ?? r.url}: ${r.url}`);
  }
  return parts.join("\n") || "No results found.";
}

async function xaiSearch(query: string, ctx: ExtensionContext, signal?: AbortSignal) {
  const key = getApiKey("xai");
  if (!key) throw new Error("XAI_API_KEY not configured");
  const res = await fetch("https://api.x.ai/v1/responses", {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: model(ctx), tools: [{ type: "web_search" }], input: query }),
  });
  if (!res.ok) throw new Error(`xAI search ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data: any = await res.json();
  const parts: string[] = [];
  for (const item of data.output ?? []) if (item.type === "message") for (const c of item.content ?? []) if (c.text) parts.push(c.text);
  if (data.citations?.length) parts.push("\nSources:\n" + data.citations.slice(0, 8).map((c: string) => `- ${c}`).join("\n"));
  return parts.join("\n") || "No results found.";
}

async function googleSearch(query: string, ctx: ExtensionContext, signal?: AbortSignal) {
  const key = getApiKey("google");
  if (!key) throw new Error("GEMINI_API_KEY not configured");
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model(ctx)}:generateContent?key=${key}`, {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: query }] }], tools: [{ google_search: {} }] }),
  });
  if (!res.ok) throw new Error(`Gemini search ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data: any = await res.json();
  const c = data.candidates?.[0];
  const parts = [c?.content?.parts?.[0]?.text].filter(Boolean);
  if (c?.groundingMetadata?.groundingChunks?.length) {
    parts.push("\nSources:");
    for (const ch of c.groundingMetadata.groundingChunks.slice(0, 8)) if (ch.web) parts.push(`- ${ch.web.title}: ${ch.web.uri}`);
  }
  return parts.join("\n") || "No results found.";
}

async function exaSearch(query: string, maxResults: number, signal?: AbortSignal) {
  const key = getApiKey("exa");
  if (!key) throw new Error("EXA_API_KEY not configured");
  const res = await fetch("https://api.exa.ai/search", {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ query, numResults: maxResults, type: "auto" }),
  });
  if (!res.ok) throw new Error(`Exa ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data: any = await res.json();
  const results = (data.results ?? []).slice(0, maxResults);
  if (!results.length) return "No results found.";
  return results.map((r: any, i: number) => `${i + 1}. **${r.title ?? "Untitled"}**\n   ${r.url}\n   ${r.text ? String(r.text).slice(0, 300) : ""}`).join("\n\n");
}

function extractDdgUrl(raw: string) {
  const uddg = raw.match(/[?&]uddg=([^&]+)/)?.[1];
  if (uddg) try { return decodeURIComponent(uddg); } catch {}
  return raw.startsWith("//") ? `https:${raw}` : raw;
}

async function ddgSearch(query: string, maxResults: number, signal?: AbortSignal) {
  const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
    signal,
    headers: { "User-Agent": "Mozilla/5.0 (compatible; PiWebSearch/1.0)" },
  });
  if (!res.ok) throw new Error(`DuckDuckGo ${res.status}`);
  const html = await res.text();
  const titles: { url: string; title: string }[] = [];
  const snippets: string[] = [];
  let m: RegExpExecArray | null;
  const tr = /<a[^>]+class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  while ((m = tr.exec(html)) && titles.length < maxResults) titles.push({ url: extractDdgUrl(m[1]!), title: htmlDecode(m[2]!.replace(/<[^>]+>/g, "").trim()) });
  const sr = /<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;
  while ((m = sr.exec(html)) && snippets.length < maxResults) snippets.push(htmlDecode(m[1]!.replace(/<[^>]+>/g, "").trim()));
  return titles.map((r, i) => `${i + 1}. **${r.title}**\n   ${r.url}${snippets[i] ? `\n   ${snippets[i]}` : ""}`).join("\n\n") || "No results found.";
}

async function nativeSearch(query: string, ctx: ExtensionContext, signal?: AbortSignal) {
  const p = provider(ctx);
  if (p === "openai-codex") return codexSubscriptionSearch(query, signal);
  if (p === "openai") return openaiSearch(query, ctx, signal);
  if (p === "google") return googleSearch(query, ctx, signal);
  if (p === "anthropic") return anthropicSearch(query, ctx, signal);
  if (p === "xai") return xaiSearch(query, ctx, signal);
  throw new Error(`No native search backend for provider ${p || "unknown"}`);
}

async function localFetch(url: string, signal?: AbortSignal) {
  const res = await fetch(url, { signal, headers: { "User-Agent": "Mozilla/5.0 (compatible; PiWebSearch/1.0)", Accept: "text/html,text/plain,application/json,application/xml,*/*" } });
  if (!res.ok) throw new Error(`Fetch ${res.status} ${res.statusText}`);
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) return { title: url, text: JSON.stringify(await res.json(), null, 2), source: "local-json" };
  const raw = await res.text();
  if (!contentType.includes("html")) return { title: url, text: raw, source: "local-text" };
  const { document } = parseHTML(raw);
  const article = new Readability(document as any).parse();
  if (article?.content) {
    return { title: article.title || url, text: turndown.turndown(article.content).replace(/\n{3,}/g, "\n\n").trim(), source: "readability" };
  }
  const text = raw.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ").replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return { title: url, text, source: "html-strip" };
}

async function jinaFetch(url: string, signal?: AbortSignal) {
  const jinaUrl = `https://r.jina.ai/http://${url.replace(/^https?:\/\//, "")}`;
  const res = await fetch(jinaUrl, { signal, headers: { "User-Agent": "Mozilla/5.0 (compatible; PiWebSearch/1.0)" } });
  if (!res.ok) throw new Error(`Jina ${res.status}`);
  return { title: url, text: await res.text(), source: "jina" };
}

function summarizeText(text: string, question?: string, maxChars = FETCH_MAX_CHARS_DEFAULT) {
  // Deterministic compression: lead + lines containing query terms. No extra model call/cost.
  if (!question) return truncate(text, maxChars);
  const terms = question.toLowerCase().split(/\W+/).filter(t => t.length > 3).slice(0, 12);
  const paras = text.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  const scored = paras.map(p => ({ p, score: terms.reduce((n, t) => n + (p.toLowerCase().includes(t) ? 1 : 0), 0) }));
  const chosen = scored.filter(x => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 8).map(x => x.p);
  return truncate((chosen.length ? chosen : paras.slice(0, 8)).join("\n\n"), maxChars);
}

export default function webSearchExtension(pi: ExtensionAPI) {
  pi.on("session_shutdown", () => CONTENT.clear());

  pi.registerTool({
    name: "web_search",
    label: "Web Search",
    description: "Search the web. Tries native provider search when available, then Exa if EXA_API_KEY is configured, then DuckDuckGo fallback.",
    promptSnippet: "Search current web results; returns compact titles, URLs, and snippets/citations.",
    executionMode: "parallel",
    parameters: Type.Object({
      query: Type.String({ description: "Search query" }),
      maxResults: Type.Optional(Type.Number({ description: "Maximum results, default 6, max 10" })),
      provider: Type.Optional(Type.Union([Type.Literal("auto"), Type.Literal("native"), Type.Literal("exa"), Type.Literal("ddg")], { description: "Search backend preference" })),
    }),
    async execute(_id, params, signal, onUpdate, ctx) {
      const maxResults = Math.max(1, Math.min(10, Math.floor(params.maxResults ?? MAX_RESULTS_DEFAULT)));
      const pref = (params.provider ?? "auto") as SearchProvider;
      const attempts: Array<[string, () => Promise<string>]> = [];
      if (pref === "native") attempts.push(["native", () => nativeSearch(params.query, ctx, signal)]);
      else if (pref === "exa") attempts.push(["exa", () => exaSearch(params.query, maxResults, signal)]);
      else if (pref === "ddg") attempts.push(["ddg", () => ddgSearch(params.query, maxResults, signal)]);
      else {
        attempts.push(["native", () => nativeSearch(params.query, ctx, signal)]);
        if (getApiKey("exa")) attempts.push(["exa", () => exaSearch(params.query, maxResults, signal)]);
        attempts.push(["ddg", () => ddgSearch(params.query, maxResults, signal)]);
      }
      const errors: string[] = [];
      for (const [name, fn] of attempts) {
        try {
          onUpdate?.({ content: [{ type: "text", text: `Searching via ${name}...` }] });
          const text = await fn();
          return { content: [{ type: "text", text }], details: { query: params.query, provider: name, maxResults, errors } };
        } catch (e: any) {
          errors.push(`${name}: ${e?.message ?? e}`);
        }
      }
      return { content: [{ type: "text", text: `Search failed:\n${errors.join("\n")}` }], details: { errors }, isError: true };
    },
  });

  pi.registerTool({
    name: "web_fetch",
    label: "Web Fetch",
    description: "Fetch a URL and extract readable markdown locally with Mozilla Readability; optionally falls back to Jina Reader. Stores full content and returns a compact response plus content id.",
    promptSnippet: "Fetch readable page content. Use question for targeted excerpts and web_content_get to retrieve more by id.",
    executionMode: "parallel",
    parameters: Type.Object({
      url: Type.String({ description: "URL to fetch" }),
      mode: Type.Optional(Type.Union([Type.Literal("markdown"), Type.Literal("summary"), Type.Literal("extract")], { description: "markdown=clean page text, summary/extract=compact targeted excerpts" })),
      question: Type.Optional(Type.String({ description: "Question or focus for targeted extraction" })),
      maxChars: Type.Optional(Type.Number({ description: "Max chars returned, default 8000, max 30000" })),
      useJina: Type.Optional(Type.Boolean({ description: "Use Jina Reader fallback if local fetch/extraction fails or is too short. Default true." })),
    }),
    async execute(_id, params, signal, onUpdate) {
      const maxChars = Math.max(1000, Math.min(30000, Math.floor(params.maxChars ?? FETCH_MAX_CHARS_DEFAULT)));
      const mode = (params.mode ?? (params.question ? "extract" : "markdown")) as FetchMode;
      const useJina = params.useJina !== false;
      const errors: string[] = [];
      let result: { title?: string; text: string; source: string } | undefined;
      try {
        onUpdate?.({ content: [{ type: "text", text: `Fetching locally: ${params.url}` }] });
        result = await localFetch(params.url, signal);
        if (useJina && result.text.trim().length < 500) throw new Error("local extraction returned little content");
      } catch (e: any) {
        errors.push(`local: ${e?.message ?? e}`);
        if (!useJina) throw e;
        onUpdate?.({ content: [{ type: "text", text: `Trying Jina Reader fallback...` }] });
        result = await jinaFetch(params.url, signal);
      }
      const id = storeContent(params.url, result.text, result.source, result.title);
      const body = mode === "markdown" ? truncate(result.text, maxChars) : summarizeText(result.text, params.question, maxChars);
      const header = `Fetched: ${result.title ?? params.url}\nURL: ${params.url}\nContent ID: ${id}\nSource: ${result.source}${errors.length ? `\nFallback notes: ${errors.join("; ")}` : ""}\n\n`;
      return { content: [{ type: "text", text: header + body }], details: { id, url: params.url, source: result.source, title: result.title, chars: result.text.length, returnedChars: body.length, errors } };
    },
  });

  pi.registerTool({
    name: "web_content_get",
    label: "Get Web Content",
    description: "Retrieve stored full content from a previous web_fetch by content id, optionally targeted by query.",
    executionMode: "parallel",
    parameters: Type.Object({
      id: Type.String({ description: "Content ID returned by web_fetch" }),
      query: Type.Optional(Type.String({ description: "Optional focus/query for relevant excerpts" })),
      offset: Type.Optional(Type.Number({ description: "Character offset for raw retrieval" })),
      maxChars: Type.Optional(Type.Number({ description: "Max chars returned, default 8000, max 30000" })),
    }),
    async execute(_id, params) {
      const item = CONTENT.get(params.id);
      if (!item) return { content: [{ type: "text", text: `No stored content for id ${params.id}.` }], isError: true };
      const maxChars = Math.max(1000, Math.min(30000, Math.floor(params.maxChars ?? FETCH_MAX_CHARS_DEFAULT)));
      const text = params.query ? summarizeText(item.text, params.query, maxChars) : truncate(item.text.slice(Math.max(0, Math.floor(params.offset ?? 0))), maxChars);
      return { content: [{ type: "text", text: `Content ID: ${item.id}\nURL: ${item.url}\nTitle: ${item.title ?? ""}\n\n${text}` }], details: { id: item.id, url: item.url, chars: item.text.length } };
    },
  });

  pi.registerCommand("web-search-status", {
    description: "Show configured web search/fetch backends",
    handler: async (_args, ctx) => {
      const lines = [
        `Active provider: ${ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : "unknown"}`,
        `Codex subscription native search: ${getCodexAuth() ? "yes" : "no"} (experimental ChatGPT backend)`,
        `Native OpenAI API key: ${getApiKey("openai") ? "yes" : "no"}`,
        `Gemini key: ${getApiKey("google") ? "yes" : "no"}`,
        `Anthropic key: ${getApiKey("anthropic") ? "yes" : "no"}`,
        `xAI key: ${getApiKey("xai") ? "yes" : "no"}`,
        `Exa key: ${getApiKey("exa") ? "yes" : "no"}`,
        `Jina fallback: available without local key (subject to Jina limits/policy)`,
        `Stored content items: ${CONTENT.size}/${MAX_STORED_ITEMS}`,
      ];
      ctx.ui.notify(lines.join("\n"), "info");
    },
  });
}
