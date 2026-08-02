import type { ToolName } from "./types.js";

export interface TextContentPart {
  type: "text";
  text: string;
}

export interface ImageContentPart {
  type: "image";
  data: string;
  mimeType: string;
}

export type ToolContentPart = TextContentPart | ImageContentPart;

export interface StoredToolResult {
  content: ToolContentPart[];
  details?: unknown;
}

export interface ToolCardInput {
  name: ToolName;
  args: Record<string, unknown> | undefined;
  result?: StoredToolResult;
  isError?: boolean;
  isPartial?: boolean;
  elapsedMs?: number;
}

export const PENDING_LABELS: Record<ToolName, string> = {
  read: "Reading...",
  write: "Writing...",
  edit: "Editing...",
  bash: "Running...",
  grep: "Searching...",
  find: "Finding...",
  ls: "Listing...",
};

function value(args: Record<string, unknown> | undefined, key: string): string {
  const raw = args?.[key];
  return typeof raw === "string" ? raw : raw === undefined || raw === null ? "" : String(raw);
}

function compact(valueToCompact: string): string {
  return valueToCompact.replace(/\s+/g, " ").trim();
}

function compactPath(path: string, maxLength = 48): string {
  if (path.length <= maxLength) return path;
  const normalized = path.replace(/\\/g, "/");
  const tail = normalized.split("/").filter(Boolean).slice(-2).join("/");
  const candidate = `…/${tail}`;
  return candidate.length <= maxLength ? candidate : `…${candidate.slice(-(maxLength - 1))}`;
}

function countLogicalLines(text: string): number {
  const normalized = text.replace(/\r\n?/g, "\n").replace(/\n+$/, "");
  return normalized.length === 0 ? 0 : normalized.split("\n").length;
}

function textParts(result: StoredToolResult | undefined): string[] {
  return result?.content.filter((part): part is TextContentPart => part.type === "text").map((part) => part.text) ?? [];
}

function textOutput(result: StoredToolResult | undefined): string {
  return textParts(result).join("\n");
}

export interface EstimatedTokenUsage {
  input: number;
  output: number;
  total: number;
}

function tokenEstimate(text: string): number {
  return text ? Math.max(1, Math.round(Array.from(text).length / 4)) : 0;
}

export function formatTokenCount(count: number): string {
  if (count < 1000) return count.toString();
  if (count < 10_000) return `${(count / 1000).toFixed(1)}k`;
  if (count < 1_000_000) return `${Math.round(count / 1000)}k`;
  if (count < 10_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  return `${Math.round(count / 1_000_000)}M`;
}

export function estimatedTokenUsage(
  name: ToolName,
  args: Record<string, unknown> | undefined,
  result: StoredToolResult | undefined,
): EstimatedTokenUsage {
  const output = tokenEstimate(JSON.stringify({ name, arguments: args ?? {} }));
  const resultText = result?.content.map((part) => part.type === "text" ? part.text : `[image:${part.mimeType}]`).join("\n") ?? "";
  const input = tokenEstimate(resultText);
  return { input, output, total: input + output };
}

function readTextLineCount(result: StoredToolResult | undefined): number {
  const details = result?.details;
  if (typeof details === "object" && details !== null && "truncation" in details) {
    const truncation = details.truncation;
    if (typeof truncation === "object" && truncation !== null) {
      if ("firstLineExceedsLimit" in truncation && truncation.firstLineExceedsLimit === true) return 0;
      if ("outputLines" in truncation && typeof truncation.outputLines === "number") return truncation.outputLines;
    }
  }

  const output = textOutput(result).replace(/\r\n?/g, "\n");
  const withoutContinuationNotice = output.replace(
    /\n\n\[(?:\d+ more lines in file|Showing lines \d+-\d+ of \d+(?: \([^\n\]]+ limit\))?)\. Use offset=\d+ to continue\.\]$/,
    "",
  );
  if (/^\[Line \d+ is [^\n\]]+, exceeds [^\n\]]+ limit\. Use bash: /.test(withoutContinuationNotice)) return 0;
  return countLogicalLines(withoutContinuationNotice);
}

function firstNonEmptyStoredLine(result: StoredToolResult | undefined): string | undefined {
  for (const text of textParts(result)) {
    for (const line of text.replace(/\r\n?/g, "\n").split("\n")) {
      if (line.trim()) return line.trim();
    }
  }
  return undefined;
}

function countMatches(result: StoredToolResult | undefined): { matches: number; files: number } {
  const files = new Set<string>();
  let matches = 0;
  for (const line of textOutput(result).replace(/\r\n?/g, "\n").split("\n")) {
    if (line.startsWith("[")) continue;
    const match = line.match(/^(.*):(\d+):/);
    if (!match) continue;
    matches++;
    files.add(match[1]);
  }
  return { matches, files: files.size };
}

function countResultLines(result: StoredToolResult | undefined, emptyMessage: string): number {
  const output = textOutput(result).replace(/\r\n?/g, "\n").trim();
  if (!output || output === emptyMessage) return 0;
  return output.split("\n").filter((line) => line.trim() && !line.startsWith("[")).length;
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

export function formatDuration(milliseconds: number): string {
  const value = Math.max(0, milliseconds);
  if (value < 1000) return `${Math.round(value)}ms`;
  if (value < 60_000) return `${(value / 1000).toFixed(value < 10_000 ? 1 : 0).replace(/\.0$/, "")}s`;
  const minutes = Math.floor(value / 60_000);
  const seconds = Math.round((value % 60_000) / 1000);
  return seconds ? `${minutes}m ${seconds}s` : `${minutes}m`;
}

function imageSummary(result: StoredToolResult | undefined): string | undefined {
  const image = result?.content.find((part): part is ImageContentPart => part.type === "image");
  if (!image) return undefined;
  const bytes = Buffer.from(image.data, "base64").byteLength;
  return `${image.mimeType} · ${formatByteSize(bytes)}`;
}

function diffCounts(result: StoredToolResult | undefined): { added: number; removed: number } {
  const details = result?.details;
  const diff = typeof details === "object" && details !== null && "diff" in details && typeof details.diff === "object" && details.diff !== null && "diff" in details.diff && typeof details.diff.diff === "string"
    ? details.diff.diff
    : typeof details === "object" && details !== null && "diff" in details && typeof details.diff === "string"
      ? details.diff
      : "";
  let added = 0;
  let removed = 0;
  for (const line of diff.split("\n")) {
    if (/^\+\s*\d+\s/.test(line)) added++;
    if (/^-\s*\d+\s/.test(line)) removed++;
  }
  return { added, removed };
}

function formatCount(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function readRange(args: Record<string, unknown> | undefined): string {
  const offset = typeof args?.offset === "number" ? args.offset : undefined;
  const limit = typeof args?.limit === "number" ? args.limit : undefined;
  if (offset === undefined && limit === undefined) return "";
  const start = offset ?? 1;
  const end = limit === undefined ? "" : `-${start + limit - 1}`;
  return `:${start}${end}`;
}

export function compactInvocation(name: ToolName, args: Record<string, unknown> | undefined): string {
  switch (name) {
    case "read":
      return `${compactPath(value(args, "path") || ".")}${readRange(args)}`;
    case "write":
    case "edit":
    case "ls":
      return compactPath(value(args, "path") || (name === "ls" ? "." : ""));
    case "bash": {
      const command = compact(value(args, "command"));
      return command.length <= 72 ? command : `${command.slice(0, 69)}...`;
    }
    case "grep":
    case "find": {
      const path = compactPath(value(args, "path") || ".", 36);
      return `${compact(value(args, "pattern"))} @ ${path}`;
    }
  }
}

export function pendingLabel(name: ToolName): string {
  return PENDING_LABELS[name];
}

export function errorSummary(result: StoredToolResult | undefined): string {
  return firstNonEmptyStoredLine(result) ?? "Tool failed without output";
}

function bashErrorSummary(result: StoredToolResult | undefined): string {
  const lines = textOutput(result).replace(/\r\n?/g, "\n").split("\n").map((line) => line.trim()).filter(Boolean);
  const status = [...lines].reverse().find((line) => /^Command (?:exited with code|timed out|aborted)/.test(line));
  if (status?.startsWith("Command exited with code ")) return `exit ${status.slice("Command exited with code ".length)}`;
  if (status?.startsWith("Command timed out")) return "timeout";
  if (status === "Command aborted") return "aborted";
  return lines[0] ?? "failed";
}

export function resultSummary(input: ToolCardInput): string {
  if (!input.result || input.isPartial) return pendingLabel(input.name);
  if (input.isError) return input.name === "bash" ? bashErrorSummary(input.result) : errorSummary(input.result);

  switch (input.name) {
    case "read": {
      const image = imageSummary(input.result);
      return image ?? formatCount(readTextLineCount(input.result), "line");
    }
    case "write": {
      const content = value(input.args, "content");
      return formatCount(countLogicalLines(content), "line");
    }
    case "edit": {
      const counts = diffCounts(input.result);
      return `+${counts.added}  -${counts.removed}`;
    }
    case "bash":
      return input.elapsedMs === undefined ? "" : formatDuration(input.elapsedMs);
    case "grep": {
      const counts = countMatches(input.result);
      return `${formatCount(counts.matches, "match", "matches")} · ${formatCount(counts.files, "file")}`;
    }
    case "find":
      return formatCount(countResultLines(input.result, "No files found matching pattern"), "file");
    case "ls":
      return formatCount(countResultLines(input.result, "(empty directory)"), "entry", "entries");
  }
}

export function expandedText(result: StoredToolResult | undefined): string[] {
  if (!result) return [];
  return result.content.flatMap((part) => {
    if (part.type !== "text") return [];
    return part.text.replace(/\r\n?/g, "\n").split("\n");
  });
}
