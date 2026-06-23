import type { Component } from "@earendil-works/pi-tui";
import { Text, truncateToWidth } from "@earendil-works/pi-tui";

class CompactLines implements Component {
  private readonly lines: string[];

  constructor(lines: string[]) {
    this.lines = lines;
  }

  render(width: number): string[] {
    if (width <= 0) return this.lines.map(() => "");
    return this.lines.map((line) => truncateToWidth(line, width));
  }

  invalidate(): void {}
}

function resultText(result: any) {
  return result.content
    ?.filter((c: any) => c.type === "text" && typeof c.text === "string")
    .map((c: any) => c.text)
    .join("\n") ?? "";
}

function compact(text: unknown, fallback = "") {
  const value = typeof text === "string" ? text : "";
  return value.replace(/\s+/g, " ").trim() || fallback;
}

function stripMarkdown(text: string) {
  return compact(text.replace(/\*\*/g, "").replace(/`/g, ""));
}

function quote(text: unknown, fallback = "untitled") {
  return `"${compact(text, fallback)}"`;
}

function headerValue(text: string, label: string) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = text.match(new RegExp(`^${escaped}:\\s*(.*)$`, "m"));
  return compact(match?.[1]);
}

function formatNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value.toLocaleString() : undefined;
}

function formatChars(returned: unknown, total: unknown) {
  const returnedText = formatNumber(returned);
  const totalText = formatNumber(total);
  if (returnedText && totalText) return `${returnedText}/${totalText} chars`;
  if (totalText) return `${totalText} chars`;
  if (returnedText) return `${returnedText} chars`;
  return undefined;
}

function searchResultCount(text: string) {
  const numbered = [...text.matchAll(/^\s*\d+\.\s+/gm)].length;
  if (numbered > 0) return numbered;
  const sourceLines = [...text.matchAll(/^\s*[-*]\s+.+?:\s+https?:\/\//gm)].length;
  return sourceLines > 0 ? sourceLines : undefined;
}

function firstSearchTitle(text: string) {
  const numberedTitle = text.match(/^\s*\d+\.\s+\*\*(.+?)\*\*/m)?.[1];
  if (numberedTitle) return stripMarkdown(numberedTitle);
  const sourceTitle = text.match(/^\s*[-*]\s+([^:\n]+):\s+https?:\/\//m)?.[1];
  if (sourceTitle) return stripMarkdown(sourceTitle);
  const line = text
    .split("\n")
    .map((l) => stripMarkdown(l))
    .find((l) => l && l !== "Sources:" && !/^https?:\/\//.test(l));
  return line;
}

function renderExpandedOrProgress(result: any, options: any, theme: any, fallback: string) {
  const text = resultText(result);
  if (options?.expanded) return new Text(text, 0, 0);
  if (options?.isPartial) return new CompactLines([theme.fg("muted", compact(text, fallback))]);
  return undefined;
}

export function renderSearchResult(result: any, options: any, theme: any, context: any) {
  const base = renderExpandedOrProgress(result, options, theme, "Searching...");
  if (base) return base;

  const text = resultText(result);
  const errors = Array.isArray(result.details?.errors) ? result.details.errors : [];
  if (result.isError || context?.isError || text.startsWith("Search failed:")) {
    const count = errors.length || text.split("\n").slice(1).filter((line) => line.trim()).length;
    return new CompactLines([theme.fg("error", `Search failed${count ? ` - ${count} backend errors` : ""}`)]);
  }

  const query = result.details?.query ?? context?.args?.query ?? "";
  const providerName = result.details?.provider ?? context?.args?.provider;
  const count = searchResultCount(text);
  const top = firstSearchTitle(text);
  const lines = [
    `${theme.fg("toolTitle", "Search")} ${theme.fg("accent", quote(query, "query"))}`
      + (count ? ` - ${count} results` : "")
      + (providerName ? ` - via ${theme.fg("muted", providerName)}` : "")
      + (top ? ` - top: ${top}` : ""),
  ];
  if (errors.length > 0) lines.push(theme.fg("warning", `fallbacks: ${errors.length}`));
  return new CompactLines(lines);
}

export function renderFetchResult(result: any, options: any, theme: any, context: any) {
  const base = renderExpandedOrProgress(result, options, theme, "Fetching...");
  if (base) return base;

  const text = resultText(result);
  if (result.isError || context?.isError) return new CompactLines([theme.fg("error", compact(text, "Fetch failed"))]);

  const title = result.details?.title ?? headerValue(text, "Fetched") ?? result.details?.url;
  const source = result.details?.source ?? headerValue(text, "Source");
  const id = result.details?.id ?? headerValue(text, "Content ID");
  const chars = formatChars(result.details?.returnedChars, result.details?.chars);
  const errors = Array.isArray(result.details?.errors) ? result.details.errors : [];
  const lines = [
    `${theme.fg("toolTitle", "Fetched")} ${theme.fg("accent", quote(title))}`
      + (source ? ` - ${theme.fg("muted", source)}` : "")
      + (chars ? ` - ${chars}` : "")
      + (id ? ` - id: ${theme.fg("accent", id)}` : ""),
  ];
  if (errors.length > 0) lines.push(theme.fg("warning", `fallbacks: ${errors.length}`));
  return new CompactLines(lines);
}

export function renderContentResult(result: any, options: any, theme: any, context: any) {
  const base = renderExpandedOrProgress(result, options, theme, "Loading content...");
  if (base) return base;

  const text = resultText(result);
  if (result.isError || context?.isError || text.startsWith("No stored content for id ")) {
    return new CompactLines([theme.fg("error", compact(text, "No stored content"))]);
  }

  const id = result.details?.id ?? headerValue(text, "Content ID") ?? context?.args?.id;
  const title = headerValue(text, "Title");
  const chars = formatChars(undefined, result.details?.chars);
  return new CompactLines([
    `${theme.fg("toolTitle", "Content")} ${theme.fg("accent", compact(id, "unknown"))}`
      + (title ? ` - ${quote(title)}` : "")
      + (chars ? ` - ${chars}` : ""),
  ]);
}
