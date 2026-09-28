import type { ExtensionUIContext } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

type ToolActivity = {
  readonly name: string;
  readonly target: string | undefined;
  readonly startedAt: number;
};
type CompletedTool = {
  readonly tool: ToolActivity;
  readonly outcome: "completed" | "failed";
};
type Run = {
  readonly startedAt: number;
  readonly tools: Map<string, ToolActivity>;
  lastCompleted: CompletedTool | undefined;
  failedCalls: number;
};
export type ActivitySnapshot =
  | { readonly kind: "idle" }
  | {
      readonly kind: "active";
      readonly startedAt: number;
      readonly waiting: boolean;
      readonly tools: readonly ToolActivity[];
      readonly lastCompleted: CompletedTool | undefined;
      readonly failedCalls: number;
    };

type ActivityTheme = Pick<ExtensionUIContext["theme"], "fg">;
const PATH_TOOLS = new Set(["read", "edit", "write"]);

export class CalmActivity {
  private run: Run | undefined;
  private waitingSince: number | undefined;

  constructor(private readonly changed: () => void) {}

  start(now: number): void {
    this.run = { startedAt: now, tools: new Map(), lastCompleted: undefined, failedCalls: 0 };
    this.changed();
  }

  toolStart(id: string, name: string, args: unknown, now: number): void {
    if (this.run === undefined) return;
    const target = PATH_TOOLS.has(name) ? pathHint(args) : undefined;
    this.run.tools.set(id, { name, target, startedAt: now });
    this.changed();
  }

  toolEnd(id: string, failed: boolean): void {
    const tool = this.run?.tools.get(id);

    if (this.run === undefined || tool === undefined) return;
    this.run.tools.delete(id);
    this.run.lastCompleted = { tool, outcome: failed ? "failed" : "completed" };
    if (failed) this.run.failedCalls += 1;
    this.changed();
  }

  settle(): void {
    this.run = undefined;
    this.changed();
  }

  promptStart(now: number): void {
    this.waitingSince = now;
    this.changed();
  }

  promptEnd(): void {
    this.waitingSince = undefined;
    this.changed();
  }

  clear(): void {
    this.run = undefined;
    this.waitingSince = undefined;
    this.changed();
  }

  snapshot(): ActivitySnapshot {
    const startedAt = this.run?.startedAt ?? this.waitingSince;

    if (startedAt === undefined) return { kind: "idle" };

    return {
      kind: "active",
      startedAt,
      waiting: this.waitingSince !== undefined,
      tools: this.run === undefined ? [] : [...this.run.tools.values()],
      lastCompleted: this.run?.lastCompleted,
      failedCalls: this.run?.failedCalls ?? 0,
    };
  }
}

function pathHint(args: unknown): string | undefined {
  if (args === null || typeof args !== "object" || Array.isArray(args)) return undefined;
  const path: unknown = Object.getOwnPropertyDescriptor(args, "path")?.value;

  if (typeof path !== "string") return undefined;
  const name = path.split(/[\\/]/u).filter(Boolean).at(-1);

  if (name === undefined || name === "." || name === ".." || !/^[A-Za-z0-9._-]+$/.test(name))
    return undefined;

  return truncateToWidth(name, 32);
}

function toolLabel(tool: ToolActivity): string {
  const name = tool.name.replace(/[^A-Za-z0-9_:-]/g, "").slice(0, 24) || "tool";

  return tool.target === undefined ? name : `${name} ${tool.target}`;
}

function elapsed(start: number, now: number): string {
  const seconds = Math.max(0, Math.floor((now - start) / 1000));

  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);

  if (minutes < 60) return `${minutes}m ${String(seconds % 60).padStart(2, "0")}s`;

  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}

function activityLabel(
  state: Extract<ActivitySnapshot, { kind: "active" }>,
  now: number,
  theme: ActivityTheme,
): string {
  if (state.waiting) return theme.fg("text", "Awaiting input");
  const oldest = state.tools[0];

  if (oldest !== undefined) {
    const others = state.tools.length - 1;
    const extra = others > 0 ? ` +${others} running` : "";

    return theme.fg("text", `${toolLabel(oldest)} ${elapsed(oldest.startedAt, now)}${extra}`);
  }
  const completed = state.lastCompleted;

  if (completed === undefined) return "";
  const marker = completed.outcome === "failed" ? theme.fg("warning", "×") : theme.fg("dim", "✓");

  return `${marker} ${theme.fg("dim", toolLabel(completed.tool))}`;
}

export function calmActivityLines(
  state: ActivitySnapshot,
  now: number,
  width: number,
  theme: ActivityTheme,
): string[] {
  if (state.kind === "idle" || width < 1) return [];
  const label = activityLabel(state, now, theme);
  const live = `${theme.fg("accent", "●")}${label === "" ? "" : ` ${label}`}`;
  const clock = theme.fg("muted", elapsed(state.startedAt, now));
  const failures =
    state.failedCalls > 0
      ? `${theme.fg("warning", "×")}${theme.fg("muted", ` ${state.failedCalls}`)}  `
      : "";
  const summary = `${failures}${clock}`;
  const available = width - visibleWidth(summary) - 2;

  if (available < 8) return [truncateToWidth(live, width, "")];
  const clippedLive = truncateToWidth(live, available);

  return [`${clippedLive}  ${summary}`];
}
