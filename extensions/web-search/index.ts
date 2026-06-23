import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { FETCH_MAX_CHARS_DEFAULT, MAX_STORED_ITEMS } from "./constants.ts";
import { getApiKey, getCodexAuth } from "./auth.ts";
import { runFetch } from "./fetch.ts";
import { renderContentResult, renderFetchResult, renderSearchResult } from "./renderers.ts";
import { runSearch } from "./search.ts";
import { clearStoredContent, getStoredContent, storedContentCount } from "./storage.ts";
import { summarizeText, truncate } from "./text.ts";

export default function webSearchExtension(pi: ExtensionAPI) {
  pi.on("session_shutdown", () => clearStoredContent());

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
    renderResult: renderSearchResult,
    async execute(_id, params, signal, onUpdate, ctx) {
      return runSearch(params, ctx, signal, onUpdate);
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
    renderResult: renderFetchResult,
    async execute(_id, params, signal, onUpdate) {
      return runFetch(params, signal, onUpdate);
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
    renderResult: renderContentResult,
    async execute(_id, params) {
      const item = getStoredContent(params.id);
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
        "Jina fallback: available without local key (subject to Jina limits/policy)",
        `Stored content items: ${storedContentCount()}/${MAX_STORED_ITEMS}`,
      ];
      ctx.ui.notify(lines.join("\n"), "info");
    },
  });
}
