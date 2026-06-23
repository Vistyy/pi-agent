import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import TurndownService from "turndown";
import { FETCH_MAX_CHARS_DEFAULT } from "./constants.ts";
import { storeContent } from "./storage.ts";
import { summarizeText, truncate } from "./text.ts";
import type { FetchMode, FetchResult } from "./types.ts";

const turndown = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced" });

async function localFetch(url: string, signal?: AbortSignal): Promise<FetchResult> {
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

async function jinaFetch(url: string, signal?: AbortSignal): Promise<FetchResult> {
  const jinaUrl = `https://r.jina.ai/http://${url.replace(/^https?:\/\//, "")}`;
  const res = await fetch(jinaUrl, { signal, headers: { "User-Agent": "Mozilla/5.0 (compatible; PiWebSearch/1.0)" } });
  if (!res.ok) throw new Error(`Jina ${res.status}`);
  return { title: url, text: await res.text(), source: "jina" };
}

export async function runFetch(params: any, signal?: AbortSignal, onUpdate?: (result: any) => void) {
  const maxChars = Math.max(1000, Math.min(30000, Math.floor(params.maxChars ?? FETCH_MAX_CHARS_DEFAULT)));
  const mode = (params.mode ?? (params.question ? "extract" : "markdown")) as FetchMode;
  const useJina = params.useJina !== false;
  const errors: string[] = [];
  let result: FetchResult | undefined;
  try {
    onUpdate?.({ content: [{ type: "text", text: `Fetching locally: ${params.url}` }] });
    result = await localFetch(params.url, signal);
    if (useJina && result.text.trim().length < 500) throw new Error("local extraction returned little content");
  } catch (e: any) {
    errors.push(`local: ${e?.message ?? e}`);
    if (!useJina) throw e;
    onUpdate?.({ content: [{ type: "text", text: "Trying Jina Reader fallback..." }] });
    result = await jinaFetch(params.url, signal);
  }
  const id = storeContent(params.url, result.text, result.source, result.title);
  const body = mode === "markdown" ? truncate(result.text, maxChars) : summarizeText(result.text, params.question, maxChars);
  const header = `Fetched: ${result.title ?? params.url}\nURL: ${params.url}\nContent ID: ${id}\nSource: ${result.source}${errors.length ? `\nFallback notes: ${errors.join("; ")}` : ""}\n\n`;
  return { content: [{ type: "text", text: header + body }], details: { id, url: params.url, source: result.source, title: result.title, chars: result.text.length, returnedChars: body.length, errors } };
}
