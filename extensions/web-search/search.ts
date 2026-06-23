import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { MAX_RESULTS_DEFAULT } from "./constants.ts";
import { getApiKey, getCodexAuth } from "./auth.ts";
import { htmlDecode } from "./text.ts";
import type { SearchProvider } from "./types.ts";

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

export async function runSearch(params: any, ctx: ExtensionContext, signal?: AbortSignal, onUpdate?: (result: any) => void) {
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
}
