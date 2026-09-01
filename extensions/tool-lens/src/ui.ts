import { decodeKittyPrintable, matchesKey, type Component, type KeyId } from "@earendil-works/pi-tui";
import type { Theme } from "@earendil-works/pi-coding-agent";
import {
  estimateTokenUsage,
  filterToolResults,
  summarizeResult,
  type EstimatedTokenUsage,
  type ToolLensResult,
} from "./project.js";
import type { PreviewRenderer } from "./native-renderer.js";
import {
  frameLines,
  paintLine,
  renderHeader,
  renderResultRow,
  renderTokenUsage,
  resultBodyLines,
  sanitizeTerminalText,
  softWrap,
} from "./format.js";

const DEFAULT_TOTAL_ROWS = 23;
const FRAME_AND_FIXED_CONTENT_ROWS = 5;

function isKey(data: string, key: KeyId): boolean {
  return matchesKey(data, key);
}

export class ToolLensComponent implements Component {
  private filter = "";
  private selectedIndex = 0;
  private listOffset = 0;
  private detailOffset = 0;
  private filteredCache?: { filter: string; results: ToolLensResult[] };
  private readonly metricsCache = new Map<string, { summary: string; usage: EstimatedTokenUsage }>();
  private readonly previewCache = new Map<string, { width: number; lines: string[] }>();

  constructor(
    private readonly results: readonly ToolLensResult[],
    private readonly theme: Theme,
    private readonly close: () => void,
    private readonly requestRender: () => void,
    private readonly previewRenderer: PreviewRenderer = (result, width) => resultBodyLines(result, width),
    private readonly heightProvider: () => number = () => DEFAULT_TOTAL_ROWS,
  ) {}

  invalidate(): void {
    this.previewCache.clear();
  }

  private paneRows(): number {
    return Math.max(1, this.heightProvider() - FRAME_AND_FIXED_CONTENT_ROWS);
  }

  private filteredResults(): ToolLensResult[] {
    if (this.filteredCache?.filter === this.filter) return this.filteredCache.results;
    const results = filterToolResults(this.results, this.filter);
    this.filteredCache = { filter: this.filter, results };
    return results;
  }

  private metrics(result: ToolLensResult): { summary: string; usage: EstimatedTokenUsage } {
    const cached = this.metricsCache.get(result.toolCallId);
    if (cached) return cached;
    const metrics = {
      summary: summarizeResult(result.content, result.isError),
      usage: estimateTokenUsage(result.toolName, result.args, result.content),
    };
    this.metricsCache.set(result.toolCallId, metrics);
    return metrics;
  }

  private previewLines(result: ToolLensResult, width: number): string[] {
    const cached = this.previewCache.get(result.toolCallId);
    if (cached?.width === width) return cached.lines;
    const lines = this.previewRenderer(result, width);
    this.previewCache.set(result.toolCallId, { width, lines });
    return lines;
  }

  private moveSelection(delta: number): void {
    const results = this.filteredResults();
    if (!results.length) return;
    const next = Math.max(0, Math.min(results.length - 1, this.selectedIndex + delta));
    if (next !== this.selectedIndex) {
      this.selectedIndex = next;
      this.detailOffset = 0;
    }
  }

  handleInput(data: string): void {
    if (isKey(data, "escape")) {
      this.close();
      return;
    }
    const scrollPage = Math.max(1, Math.floor(this.paneRows() / 2));
    if (isKey(data, "shift+up")) this.detailOffset = Math.max(0, this.detailOffset - 1);
    else if (isKey(data, "shift+down")) this.detailOffset += 1;
    else if (isKey(data, "ctrl+u")) this.detailOffset = Math.max(0, this.detailOffset - scrollPage);
    else if (isKey(data, "ctrl+d")) this.detailOffset += scrollPage;
    else if (isKey(data, "home")) this.detailOffset = 0;
    else if (isKey(data, "end")) this.detailOffset = Number.MAX_SAFE_INTEGER;
    else if (isKey(data, "up")) this.moveSelection(-1);
    else if (isKey(data, "down")) this.moveSelection(1);
    else if (isKey(data, "backspace")) {
      this.filter = this.filter.slice(0, -1);
      this.filteredCache = undefined;
      this.selectedIndex = 0;
      this.listOffset = 0;
      this.detailOffset = 0;
    } else {
      const printable = decodeKittyPrintable(data) ?? (data.length === 1 ? data : undefined);
      if (printable && printable.length === 1 && printable >= " ") {
        this.filter += printable;
        this.filteredCache = undefined;
        this.selectedIndex = 0;
        this.listOffset = 0;
        this.detailOffset = 0;
      }
    }
    this.requestRender();
  }

  private listRows(width: number): string[] {
    const rows = this.filteredResults();
    if (!this.results.length) return softWrap("No completed tool results on active branch.", width);
    if (!rows.length) return softWrap("No matching tool results.", width);

    const paneRows = this.paneRows();
    const maxOffset = Math.max(0, rows.length - paneRows);
    if (this.selectedIndex < this.listOffset) this.listOffset = this.selectedIndex;
    if (this.selectedIndex >= this.listOffset + paneRows) this.listOffset = this.selectedIndex - paneRows + 1;
    this.listOffset = Math.max(0, Math.min(maxOffset, this.listOffset));
    return rows
      .slice(this.listOffset, this.listOffset + paneRows)
      .map((result, index) => renderResultRow(this.theme, result, this.listOffset + index === this.selectedIndex, width));
  }

  private previewRows(width: number): string[] {
    const result = this.filteredResults()[this.selectedIndex];
    if (!result) return [paintLine(this.theme, "No result selected.", width)];
    const metrics = this.metrics(result);
    const outcome = result.isError ? this.theme.fg("error", "failed") : this.theme.fg("muted", metrics.summary);
    const header = `${this.theme.fg("accent", this.theme.bold(sanitizeTerminalText(result.toolName)))}  ${outcome}  ${renderTokenUsage(this.theme, metrics.usage)}`;
    const body = this.previewLines(result, width);
    const bodyRows = this.paneRows() - 1;
    const maxOffset = Math.max(0, body.length - bodyRows);
    this.detailOffset = Math.max(0, Math.min(maxOffset, this.detailOffset));
    return [
      paintLine(this.theme, header, width, (value) => this.theme.bg("toolPendingBg", value)),
      ...body.slice(this.detailOffset, this.detailOffset + bodyRows).map((line) => paintLine(this.theme, line, width)),
    ];
  }

  private renderContent(width: number): string[] {
    const lines = [
      renderHeader(this.theme, "Tool Lens", width),
      paintLine(this.theme, `Filter: ${this.filter}`, width),
    ];
    if (width < 36) {
      lines.push(...this.listRows(width).slice(0, this.paneRows()).map((line) => paintLine(this.theme, line, width)));
    } else {
      const dividerWidth = 1;
      const leftWidth = Math.max(16, Math.floor((width - dividerWidth) * 0.3));
      const rightWidth = width - dividerWidth - leftWidth;
      const left = this.listRows(leftWidth);
      const right = this.previewRows(rightWidth);
      const divider = this.theme.fg("borderAccent", "│");
      for (let index = 0; index < this.paneRows(); index += 1) {
        lines.push(`${paintLine(this.theme, left[index] ?? "", leftWidth)}${divider}${paintLine(this.theme, right[index] ?? "", rightWidth)}`);
      }
    }
    lines.push(paintLine(this.theme, "↑↓ select · Shift+↑↓ line · Ctrl+U/D page · Home/End · type filter · Esc close", width, (value) => this.theme.bg("customMessageBg", this.theme.fg("muted", value))));
    return lines;
  }

  render(width: number): string[] {
    const safeWidth = Math.max(1, width);
    if (safeWidth < 4) return this.renderContent(safeWidth);
    return frameLines(this.theme, this.renderContent(safeWidth - 2), safeWidth);
  }
}
