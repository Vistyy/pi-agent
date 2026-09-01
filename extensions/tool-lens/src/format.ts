import { truncateToWidth, visibleWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";
import type { Theme } from "@earendil-works/pi-coding-agent";
import type { EstimatedTokenUsage, LensContent, ToolLensResult } from "./project.js";

const ANSI_PATTERN = /\u001B\][^\u0007]*(?:\u0007|\u001B\\)|\u001B\[[0-?]*[ -/]*[@-~]|\u001B[@-_]/g;
const CONTROL_PATTERN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

export function sanitizeTerminalText(text: string): string {
  return text.replace(ANSI_PATTERN, "").replace(CONTROL_PATTERN, "");
}

export function formatByteSize(bytes: number): string {
  const units = ["B", "KB", "MB", "GB"];
  let value = Math.max(0, bytes);
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const displayed = unit === 0 || value >= 10 ? Math.round(value).toString() : value.toFixed(1).replace(/\.0$/, "");
  return `${displayed} ${units[unit]}`;
}

export function softWrap(text: string, width: number): string[] {
  const safeWidth = Math.max(1, width);
  const sanitized = sanitizeTerminalText(text);
  if (!sanitized) return [];
  return sanitized.split("\n").flatMap((line) => {
    if (!line) return [""];
    return wrapTextWithAnsi(line, safeWidth);
  });
}

function metadataLines(details: unknown): string[] {
  if (typeof details !== "object" || details === null) return [];
  const record = details as Record<string, unknown>;
  const lines: string[] = [];
  const truncation = record.truncation;
  if (typeof truncation === "object" && truncation !== null) {
    const info = truncation as Record<string, unknown>;
    if (info.truncated === true) {
      const by = typeof info.truncatedBy === "string" ? ` by ${info.truncatedBy}` : "";
      const total = typeof info.totalBytes === "number" ? `, ${formatByteSize(info.totalBytes)} total` : "";
      const totalLines = typeof info.totalLines === "number" ? `, ${info.totalLines} lines total` : "";
      lines.push(`Result truncated${by}${total}${totalLines}.`);
    }
  }
  if (typeof record.fullOutputPath === "string") lines.push(`Full output path: ${record.fullOutputPath}`);
  if (typeof record.matchLimitReached === "number") lines.push(`Match limit reached: ${record.matchLimitReached}`);
  if (typeof record.resultLimitReached === "number") lines.push(`Result limit reached: ${record.resultLimitReached}`);
  if (typeof record.entryLimitReached === "number") lines.push(`Entry limit reached: ${record.entryLimitReached}`);
  if (record.linesTruncated === true) lines.push("Some match lines were truncated.");
  return lines;
}

export function resultBodyLines(result: ToolLensResult, width: number): string[] {
  const bodyWidth = Math.max(1, width);
  const lines: string[] = [];
  const content = result.content as readonly LensContent[];
  for (const part of content) {
    if (part.type === "text") {
      lines.push(...softWrap(part.text, bodyWidth));
    } else {
      lines.push(...softWrap(`Image: ${part.mimeType}`, bodyWidth));
    }
  }
  if (!lines.length) lines.push(result.isError ? "Tool failed without output" : "No output");
  const metadata = metadataLines(result.details).flatMap((line) => softWrap(line, bodyWidth));
  return metadata.length ? [...metadata, "", ...lines] : lines;
}

export function formatTokenCount(count: number): string {
  if (count < 1000) return count.toString();
  if (count < 10_000) return `${(count / 1000).toFixed(1)}k`;
  if (count < 1_000_000) return `${Math.round(count / 1000)}k`;
  if (count < 10_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  return `${Math.round(count / 1_000_000)}M`;
}

export function renderTokenUsage(theme: Theme, usage: EstimatedTokenUsage): string {
  return `${theme.fg("success", `↑${formatTokenCount(usage.input)}`)} ${theme.fg("warning", `↓${formatTokenCount(usage.output)}`)} ${theme.fg("muted", `(${formatTokenCount(usage.total)})`)}`;
}

export function fillLine(text: string, width: number): string {
  const truncated = truncateToWidth(text, Math.max(1, width));
  return truncated + " ".repeat(Math.max(0, width - visibleWidth(truncated)));
}

export function paintLine(theme: Theme, text: string, width: number, paint: (value: string) => string = (value) => theme.bg("customMessageBg", value)): string {
  return paint(fillLine(text, width));
}

export function renderHeader(theme: Theme, text: string, width: number): string {
  return paintLine(theme, text, width, (value) => theme.bg("toolPendingBg", theme.fg("accent", theme.bold(value))));
}

export function renderResultRow(theme: Theme, result: ToolLensResult, selected: boolean, width: number): string {
  const toolName = theme.fg(result.isError ? "error" : "accent", theme.bold(sanitizeTerminalText(result.toolName)));
  const prefix = `${toolName}  `;
  const invocation = truncateToWidth(sanitizeTerminalText(result.invocation), Math.max(0, width - visibleWidth(prefix)));
  const text = `${prefix}${invocation}`;
  const paint = (value: string) => selected ? theme.bg("selectedBg", value) : theme.bg("customMessageBg", value);
  return paintLine(theme, text, width, paint);
}

export function frameLines(theme: Theme, lines: string[], width: number): string[] {
  if (width < 4) return lines;
  const innerWidth = width - 2;
  const border = (text: string) => theme.fg("borderAccent", text);
  return [
    border(`╭${"─".repeat(innerWidth)}╮`),
    ...lines.map((line) => `${border("│")}${fillLine(line, innerWidth)}${border("│")}`),
    border(`╰${"─".repeat(innerWidth)}╯`),
  ];
}
