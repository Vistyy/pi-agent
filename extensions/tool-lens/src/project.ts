import type { ImageContent, TextContent } from "@earendil-works/pi-ai";
import type { SessionEntry } from "@earendil-works/pi-coding-agent";

export type LensContent = TextContent | ImageContent;

export interface ToolLensResult {
  toolCallId: string;
  toolName: string;
  invocation: string;
  args: Record<string, unknown>;
  content: LensContent[];
  details: unknown;
  isError: boolean;
  resultSummary: string;
  tokenUsage: EstimatedTokenUsage;
  resultEntryId?: string;
  resultTimestamp?: string;
}

export interface EstimatedTokenUsage {
  input: number;
  output: number;
  total: number;
}

interface ToolCallRecord {
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function clone<T>(value: T): T {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
}

function stringArg(args: Record<string, unknown>, key: string): string | undefined {
  return typeof args[key] === "string" ? args[key] : undefined;
}

function compactJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function compactInvocation(toolName: string, args: Record<string, unknown>): string {
  const path = stringArg(args, "path");
  switch (toolName) {
    case "read": {
      const offset = typeof args.offset === "number" ? args.offset : undefined;
      const limit = typeof args.limit === "number" ? args.limit : undefined;
      const start = offset ?? 1;
      const range = offset !== undefined || limit !== undefined
        ? `${start}${limit !== undefined ? `-${start + Math.max(0, limit - 1)}` : ""}`
        : "";
      return path ? (range ? `${path}:${range}` : path) : compactJson(args);
    }
    case "write":
    case "edit":
    case "ls":
      return path ?? compactJson(args);
    case "bash":
      return stringArg(args, "command") ?? compactJson(args);
    case "grep":
    case "find": {
      const pattern = stringArg(args, "pattern") ?? "";
      const searchPath = path ? ` ${path}` : "";
      return `${pattern}${searchPath}`.trim() || compactJson(args);
    }
    default: {
      const entries = Object.entries(args).slice(0, 3);
      return entries.length ? compactJson(Object.fromEntries(entries)) : "";
    }
  }
}

function logicalLineCount(text: string): number {
  const normalized = text.replace(/\r\n?/g, "\n").replace(/\n+$/, "");
  return normalized ? normalized.split("\n").length : 0;
}

function countLabel(count: number, singular: string): string {
  return `${count} ${count === 1 ? singular : `${singular}s`}`;
}

function tokenEstimate(text: string): number {
  return text ? Math.max(1, Math.round(Array.from(text).length / 4)) : 0;
}

export function estimateTokenUsage(toolName: string, args: Record<string, unknown>, content: readonly LensContent[]): EstimatedTokenUsage {
  const output = tokenEstimate(JSON.stringify({ name: toolName, arguments: args }));
  const resultText = content.map((part) => part.type === "text" ? part.text : `[image:${part.mimeType}]`).join("\n");
  const input = tokenEstimate(resultText);
  return { input, output, total: input + output };
}

export function summarizeResult(content: readonly LensContent[], isError: boolean): string {
  if (isError) return "failed";
  const textLines = content.reduce((total, part) => total + (part.type === "text" ? logicalLineCount(part.text) : 0), 0);
  const images = content.filter((part) => part.type === "image");
  if (textLines && images.length) return `${countLabel(textLines, "line")} + ${countLabel(images.length, "image")}`;
  if (textLines) return countLabel(textLines, "line");
  if (images.length === 1) return images[0].mimeType;
  if (images.length) return countLabel(images.length, "image");
  return "no output";
}

function getToolCalls(entry: SessionEntry): ToolCallRecord[] {
  if (entry.type !== "message" || !isRecord(entry.message) || entry.message.role !== "assistant") return [];
  const content = entry.message.content;
  if (!Array.isArray(content)) return [];

  return content.flatMap((part): ToolCallRecord[] => {
    if (!isRecord(part) || part.type !== "toolCall" || typeof part.id !== "string" || typeof part.name !== "string") return [];
    const args = isRecord(part.arguments) ? part.arguments : {};
    return [{ toolCallId: part.id, toolName: part.name, args }];
  });
}

interface ToolResultRecord {
  entry: SessionEntry;
  toolCallId: string;
  content: LensContent[];
  details: unknown;
  isError: boolean;
}

function getToolResult(entry: SessionEntry): ToolResultRecord | undefined {
  if (entry.type !== "message" || !isRecord(entry.message) || entry.message.role !== "toolResult") return undefined;
  const message = entry.message;
  if (typeof message.toolCallId !== "string" || typeof message.toolName !== "string") return undefined;
  const content = Array.isArray(message.content) ? message.content : [];
  if (!content.every((part) => isRecord(part) && (part.type === "text" || part.type === "image"))) return undefined;

  return {
    entry,
    toolCallId: message.toolCallId,
    content: content as LensContent[],
    details: message.details,
    isError: message.isError === true,
  };
}

/** Project one active session branch into completed tool results. */
export function projectToolResults(branch: readonly SessionEntry[]): ToolLensResult[] {
  const calls = new Map<string, ToolCallRecord>();
  for (const entry of branch) {
    for (const call of getToolCalls(entry)) calls.set(call.toolCallId, call);
  }

  const completed: ToolLensResult[] = [];
  for (let index = branch.length - 1; index >= 0; index -= 1) {
    const result = getToolResult(branch[index]);
    if (!result) continue;
    const call = calls.get(result.toolCallId);
    if (!call) continue;

    const content = clone(result.content);
    completed.push({
      toolCallId: result.toolCallId,
      toolName: call.toolName,
      invocation: compactInvocation(call.toolName, call.args),
      args: clone(call.args),
      content,
      details: clone(result.details),
      isError: result.isError,
      resultSummary: summarizeResult(content, result.isError),
      tokenUsage: estimateTokenUsage(call.toolName, call.args, content),
      resultEntryId: result.entry.id,
      resultTimestamp: result.entry.timestamp,
    });
  }
  return completed;
}

export function filterToolResults(results: readonly ToolLensResult[], query: string): ToolLensResult[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return [...results];
  return results.filter(
    (result) => result.toolName.toLowerCase().includes(normalized) || result.invocation.toLowerCase().includes(normalized),
  );
}
