import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { truncateToWidth } from "@earendil-works/pi-tui";
import { execFileSync } from "node:child_process";

type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | string;
type GitCache = { cwd: string; createdAt: number; value: string | undefined };

const GIT_CACHE_MS = 1000;
let gitCache: GitCache | undefined;

export default function statusline(pi: ExtensionAPI) {
  let thinkingLevel: ThinkingLevel = "low";

  pi.on("session_start", (_event, ctx) => {
    thinkingLevel = pi.getThinkingLevel();

    ctx.ui.setFooter((tui, theme, footerData) => {
      const unsubscribe = footerData.onBranchChange(() => tui.requestRender());

      return {
        dispose: unsubscribe,
        invalidate() {},
        render(width: number): string[] {
          const usage = summarizeUsage(ctx.sessionManager.getBranch());
          const contextUsage = ctx.getContextUsage();
          const branch = footerData.getGitBranch();
          const git = branch ? gitSummary(ctx.cwd) : undefined;
          const statuses = footerData.getExtensionStatuses();
          const codex = statuses.get("codex-usage");

          const chunks = [
            segment(theme.fg("accent", "π"), theme.fg("text", `${ctx.model?.id ?? "no model"}:${shortThinking(thinkingLevel)}`)),
            contextUsage?.percent != null ? segment(theme.fg("dim", "ctx"), theme.fg(contextUsage.percent >= 80 ? "warning" : "muted", `${Math.round(contextUsage.percent)}%`)) : undefined,
            segment(theme.fg("dim", "cwd"), theme.fg("muted", formatCwd(ctx.cwd))),
            branch ? segment(theme.fg("dim", "git"), theme.fg("success", `${branch}${git ? ` ${git}` : ""}`)) : undefined,
            segment(theme.fg("dim", "tok"), theme.fg("muted", `${fmt(usage.total)} (${fmt(usage.input)}↑/${fmt(usage.output)}↓)`)),
            usage.cost > 0 ? segment(theme.fg("dim", "$"), theme.fg("warning", usage.cost.toFixed(3))) : undefined,
            codex ? theme.fg("accent", stripAnsi(codex)) : undefined,
          ].filter(Boolean) as string[];

          const divider = theme.fg("borderMuted", "  │  ");
          return [truncateToWidth(chunks.join(divider), width, "")];
        },
      };
    });
  });

  pi.on("thinking_level_select", (event) => {
    thinkingLevel = event.level;
  });

  pi.on("session_shutdown", (_event, ctx) => {
    ctx.ui.setFooter(undefined);
  });

  pi.registerCommand("statusline", {
    description: "Reload custom one-line statusline",
    handler: async (_args, ctx) => {
      await ctx.reload();
      return;
    },
  });
}

function segment(label: string, value: string): string {
  return `${label} ${value}`;
}

function summarizeUsage(entries: Array<{ type: string; message?: unknown }>) {
  let input = 0;
  let output = 0;
  let cost = 0;

  for (const entry of entries) {
    const raw = entry.message as { role?: string } | undefined;
    if (entry.type !== "message" || raw?.role !== "assistant") continue;
    const message = raw as AssistantMessage;
    input += message.usage?.input ?? 0;
    output += message.usage?.output ?? 0;
    cost += message.usage?.cost?.total ?? 0;
  }

  return { input, output, total: input + output, cost };
}

function shortThinking(level: ThinkingLevel): string {
  switch (level) {
    case "minimal":
      return "min";
    case "medium":
      return "med";
    case "xhigh":
      return "xhi";
    default:
      return level;
  }
}

function gitSummary(cwd: string): string | undefined {
  if (gitCache && gitCache.cwd === cwd && Date.now() - gitCache.createdAt < GIT_CACHE_MS) return gitCache.value;

  try {
    const parts: string[] = [];
    const commits = commitDivergence(cwd);
    if (commits) parts.push(commits);

    const diff = parseDiffNumstat(execFileSync("git", ["diff", "--numstat", "HEAD"], {
      cwd,
      encoding: "utf8",
      timeout: 200,
      stdio: ["ignore", "pipe", "ignore"],
    }));
    const untracked = Number(execFileSync("git", ["ls-files", "--others", "--exclude-standard"], {
      cwd,
      encoding: "utf8",
      timeout: 200,
      stdio: ["ignore", "pipe", "ignore"],
    }).split("\n").filter(Boolean).length);

    if (diff.files || diff.added || diff.removed) parts.push(`${diff.files}f +${diff.added} -${diff.removed}`);
    if (untracked) parts.push(`?${untracked}`);
    gitCache = { cwd, createdAt: Date.now(), value: parts.length ? parts.join(" ") : undefined };
    return gitCache.value;
  } catch {
    gitCache = { cwd, createdAt: Date.now(), value: undefined };
    return undefined;
  }
}

function commitDivergence(cwd: string): string | undefined {
  try {
    const upstream = execFileSync("git", ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"], {
      cwd,
      encoding: "utf8",
      timeout: 200,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (!upstream) return undefined;
    const [behind, ahead] = execFileSync("git", ["rev-list", "--left-right", "--count", `${upstream}...HEAD`], {
      cwd,
      encoding: "utf8",
      timeout: 200,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim().split(/\s+/).map(Number);
    const parts = [];
    if (ahead) parts.push(`↑${ahead}`);
    if (behind) parts.push(`↓${behind}`);
    return parts.length ? parts.join(" ") : undefined;
  } catch {
    return undefined;
  }
}

function parseDiffNumstat(value: string): { files: number; added: number; removed: number } {
  let files = 0;
  let added = 0;
  let removed = 0;
  for (const line of value.split("\n")) {
    if (!line.trim()) continue;
    const [a, r] = line.split("\t");
    files++;
    added += a === "-" ? 0 : Number(a || 0);
    removed += r === "-" ? 0 : Number(r || 0);
  }
  return { files, added, removed };
}

function formatCwd(cwd: string): string {
  const home = process.env.HOME;
  return home && cwd.startsWith(home) ? `~${cwd.slice(home.length) || ""}` : cwd;
}

function fmt(value: number): string {
  if (value < 1000) return String(value);
  if (value < 1_000_000) return `${(value / 1000).toFixed(value < 10_000 ? 1 : 0)}k`;
  return `${(value / 1_000_000).toFixed(1)}m`;
}

function stripAnsi(value: string): string {
  return value.replace(/\x1b\[[0-9;]*m/g, "");
}
