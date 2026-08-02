import type { Theme } from "@earendil-works/pi-coding-agent";
import type { Component } from "@earendil-works/pi-tui";
import { truncateToWidth, visibleWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";
import {
  compactInvocation,
  estimatedTokenUsage,
  expandedText,
  formatTokenCount,
  type EstimatedTokenUsage,
  errorSummary,
  resultSummary,
  type StoredToolResult,
} from "./summaries.js";
import type { ToolName, ToolCardRenderState } from "./types.js";

type CardStatus = "pending" | "success" | "error";

interface CardData {
  name: ToolName;
  args: Record<string, unknown> | undefined;
  result?: StoredToolResult;
  status: CardStatus;
  expanded: boolean;
  elapsedMs?: number;
}

function styledSummary(name: ToolName, summary: string, status: CardStatus, theme: Theme): string {
  if (status === "error") return theme.fg("error", summary);
  if (status === "pending") return theme.fg("warning", summary);
  if (name === "edit") {
    const counts = summary.match(/^\+(\d+)  -(\d+)$/);
    if (counts) return `${theme.fg("success", `+${counts[1]}`)}  ${theme.fg("error", `-${counts[2]}`)}`;
  }
  if (name === "bash") return theme.fg("success", summary);
  return theme.fg("muted", summary);
}

function styledTokenUsage(usage: EstimatedTokenUsage, theme: Theme): string {
  return `${theme.fg("success", `↑${formatTokenCount(usage.input)}`)} ${theme.fg("warning", `↓${formatTokenCount(usage.output)}`)} ${theme.fg("muted", `(${formatTokenCount(usage.total)})`)}`;
}

function compactLines(name: ToolName, invocation: string, summary: string, usage: EstimatedTokenUsage | undefined, status: CardStatus, theme: Theme, width: number): string[] {
  const safeWidth = Math.max(1, width);
  const prefix = `${theme.fg("accent", theme.bold(name))}  `;
  const targetWidth = Math.max(0, safeWidth - visibleWidth(prefix));
  const target = truncateToWidth(theme.fg("text", invocation), targetWidth, "...", true);
  const invocationLine = truncateToWidth(`${prefix}${target}`, safeWidth, "...", true);

  const marker = status === "pending"
    ? theme.fg("warning", "…")
    : status === "error"
      ? theme.fg("error", "✕")
      : theme.fg("success", "✓");
  const result = styledSummary(name, summary, status, theme);
  const statusText = result ? `${marker} ${result}` : marker;
  const suffix = usage ? `${statusText}  ${styledTokenUsage(usage, theme)}` : statusText;
  const indent = " ".repeat(Math.min(visibleWidth(prefix), Math.max(0, safeWidth - 1)));
  const statusLine = truncateToWidth(`${indent}${suffix}`, safeWidth, "...", true);

  if (status !== "pending") return [invocationLine, statusLine];
  return [invocationLine, statusLine].map((line) => theme.bg("toolPendingBg", line + " ".repeat(Math.max(0, safeWidth - visibleWidth(line)))));
}

function resultLines(text: string, theme: Theme, status: CardStatus, width: number): string[] {
  const prefix = "  ";
  const remaining = Math.max(1, width - visibleWidth(prefix));
  const color = status === "error" ? "error" : "muted";
  const wrapped = wrapTextWithAnsi(theme.fg(color, text), remaining);
  return (wrapped.length > 0 ? wrapped : [""]).map((line) => prefix + line);
}

export class ToolCardComponent implements Component {
  private data: CardData;
  private theme: Theme;

  constructor(data: CardData, theme: Theme) {
    this.data = data;
    this.theme = theme;
  }

  setData(data: CardData, theme: Theme): void {
    this.data = data;
    this.theme = theme;
  }

  invalidate(): void {}

  render(width: number): string[] {
    const { name, args, result, status, expanded, elapsedMs } = this.data;
    const invocation = compactInvocation(name, args);
    const baseSummary = result
      ? resultSummary({ name, args, result, isError: status === "error", isPartial: status === "pending", elapsedMs })
      : resultSummary({ name, args, isPartial: true });
    const usage = result && status !== "pending" ? estimatedTokenUsage(name, args, result) : undefined;
    const lines = compactLines(name, invocation, baseSummary, usage, status, this.theme, width);
    if (!expanded || !result) return lines;
    for (const text of expandedText(result)) lines.push(...resultLines(text, this.theme, status, width));
    return lines;
  }
}

export function renderToolCard(
  name: ToolName,
  args: Record<string, unknown> | undefined,
  theme: Theme,
  context: {
    state: ToolCardRenderState;
    executionStarted: boolean;
    expanded: boolean;
    isPartial: boolean;
    isError: boolean;
  },
  result?: StoredToolResult,
): Component {
  if (context.executionStarted && context.state.startedAt === undefined) context.state.startedAt = Date.now();
  if (result && !context.isPartial && context.state.finishedAt === undefined) context.state.finishedAt = Date.now();
  const elapsedMs = context.state.startedAt !== undefined && context.state.finishedAt !== undefined
    ? context.state.finishedAt - context.state.startedAt
    : undefined;
  const status: CardStatus = context.isError ? "error" : context.isPartial || !result ? "pending" : "success";
  return new ToolCardComponent({ name, args, result, status, expanded: context.expanded, elapsedMs }, theme);
}

export function renderCardResultSummary(
  name: ToolName,
  args: Record<string, unknown> | undefined,
  result: StoredToolResult,
  isError: boolean,
): string {
  return isError ? errorSummary(result) : resultSummary({ name, args, result, isError });
}
