import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | string;
type GitCache = { cwd: string; createdAt: number; value: string | undefined };

const GIT_CACHE_MS = 1000;
const COMPACT_BRANCH_WIDTH = 20;

export default function statusline(pi: ExtensionAPI) {
  let thinkingLevel: ThinkingLevel = "low";
  let gitCache: GitCache | undefined;
  let refreshController: AbortController | undefined;
  let refreshInProgress = false;
  let disposed = false;
  let generation = 0;
  let requestRender: (() => void) | undefined;

  const stopRefresh = () => {
    disposed = true;
    generation++;
    refreshController?.abort();
    refreshController = undefined;
  };

  const scheduleRefresh = (ctx: ExtensionContext) => {
    if (disposed || refreshInProgress) return;
    if (gitCache?.cwd === ctx.cwd && Date.now() - gitCache.createdAt < GIT_CACHE_MS) return;
    void refreshGit(ctx);
  };

  const refreshGit = async (ctx: ExtensionContext) => {
    if (disposed || refreshInProgress) return;
    refreshInProgress = true;
    const refreshGeneration = generation;
    const controller = new AbortController();
    refreshController = controller;

    try {
      const value = await gitSummary(pi, ctx.cwd, controller.signal);
      if (!disposed && refreshGeneration === generation && !controller.signal.aborted) {
        gitCache = { cwd: ctx.cwd, createdAt: Date.now(), value };
        requestRender?.();
      }
    } finally {
      if (refreshController === controller) refreshController = undefined;
      refreshInProgress = false;
      if (!disposed && refreshGeneration === generation) scheduleRefresh(ctx);
    }
  };

  pi.on("session_start", (_event, ctx) => {
    stopRefresh();
    disposed = false;
    thinkingLevel = pi.getThinkingLevel();

    ctx.ui.setFooter((tui, theme, footerData) => {
      requestRender = () => tui.requestRender();
      const unsubscribe = footerData.onBranchChange(() => {
        tui.requestRender();
        scheduleRefresh(ctx);
      });

      scheduleRefresh(ctx);

      return {
        dispose: () => {
          unsubscribe();
          stopRefresh();
          requestRender = undefined;
        },
        invalidate() {},
        render(width: number): string[] {
          scheduleRefresh(ctx);
          const usage = summarizeUsage(ctx.sessionManager.getBranch());
          const contextUsage = ctx.getContextUsage();
          const branch = footerData.getGitBranch();
          const git = branch && gitCache?.cwd === ctx.cwd ? gitCache?.value : undefined;
          const statuses = footerData.getExtensionStatuses();
          const codex = statuses.get("quota-codex");
          const fast = statuses.get("openai-fast");

          const divider = theme.fg("borderMuted", " | ");
          const modelName = theme.fg("text", `${ctx.model?.id ?? "no model"}:${shortThinking(thinkingLevel)}`);
          const fastIndicator = fast ? theme.fg("accent", stripAnsi(fast)) : "";
          const model = `${theme.fg("accent", "π")} ${modelName}${fastIndicator ? ` ${fastIndicator}` : ""}`;
          const contextColor = contextUsage?.percent != null && contextUsage.percent >= 80 ? "warning" : "muted";
          const ctxPct = contextUsage?.percent != null ? theme.fg(contextColor, `${Math.round(contextUsage.percent)}%`) : undefined;
          const ctxFull = contextUsage?.tokens != null
            ? theme.fg(contextColor, `${Math.round(contextUsage.percent ?? 0)}%/${fmt(contextUsage.contextWindow)}`)
            : ctxPct;
          const cwdSeg = theme.fg("muted", formatCwd(ctx.cwd));
          const gitFull = branch ? theme.fg("success", gitText(branch, git)) : undefined;
          const branchTrimmed = branch ? truncateToWidth(branch, COMPACT_BRANCH_WIDTH, "…") : null;
          const gitTrimmed = branchTrimmed ? theme.fg("success", gitText(branchTrimmed, git)) : undefined;
          const tokFull = theme.fg("muted", `${fmt(usage.total)} (${fmt(usage.input)}↑/${fmt(usage.output)}↓)`);
          const tokCompact = theme.fg("muted", fmt(usage.total));
          const costSeg = usage.cost > 0 ? theme.fg("warning", `$${usage.cost.toFixed(3)}`) : undefined;
          const codexSeg = codex ? theme.fg("accent", stripAnsi(codex)) : undefined;
          const tiers: Array<{ chunks: string[] }> = [
            { chunks: [model, ctxFull, cwdSeg, gitFull, tokFull, costSeg, codexSeg].filter(Boolean) as string[] },
            { chunks: [model, ctxPct, cwdSeg, gitFull, tokFull, costSeg, codexSeg].filter(Boolean) as string[] },
            { chunks: [model, ctxPct, gitFull, tokFull, costSeg, codexSeg].filter(Boolean) as string[] },
            { chunks: [model, ctxPct, gitTrimmed, tokFull, costSeg, codexSeg].filter(Boolean) as string[] },
            { chunks: [model, ctxPct, gitTrimmed, tokCompact, costSeg, codexSeg].filter(Boolean) as string[] },
          ];

          for (const tier of tiers) {
            const line = tier.chunks.join(divider);
            if (visibleWidth(line) <= width) return [line];
          }

          return renderCompactStatus(
            model,
            ctxPct,
            branchTrimmed,
            git,
            [tokCompact, costSeg, codexSeg].filter(Boolean) as string[],
            width,
            divider,
            (value) => theme.fg("success", value),
          );
        },
      };
    });
  });

  pi.on("thinking_level_select", (event) => {
    thinkingLevel = event.level;
  });

  pi.on("session_shutdown", (_event, ctx) => {
    stopRefresh();
    requestRender = undefined;
    ctx.ui.setFooter(undefined);
  });

  pi.registerCommand("statusline", {
    description: "Reload custom statusline",
    handler: async (_args, ctx) => {
      await ctx.reload();
    },
  });
}

async function gitSummary(pi: ExtensionAPI, cwd: string, signal: AbortSignal): Promise<string | undefined> {
  const run = async (args: string[]) => {
    const result = await pi.exec("git", args, { cwd, signal, timeout: 200 });
    return result.code === 0 ? result.stdout.trim() : undefined;
  };

  try {
    const [upstream, originHead, baseRefs] = await Promise.all([
      run(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"]),
      run(["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"]),
      run([
        "for-each-ref",
        "--format=%(refname:short)",
        "refs/remotes/origin/main",
        "refs/remotes/origin/master",
        "refs/heads/main",
        "refs/heads/master",
      ]),
    ]);
    if (signal.aborted) return undefined;

    const baseCandidates = baseRefs?.split("\n").filter(Boolean) ?? [];
    const base = originHead
      ?? ["origin/main", "origin/master", "main", "master"].find((candidate) => baseCandidates.includes(candidate));
    const [divergenceOutput, mergeBase] = await Promise.all([
      upstream ? run(["rev-list", "--left-right", "--count", `${upstream}...HEAD`]) : undefined,
      base ? run(["merge-base", base, "HEAD"]) : undefined,
    ]);
    if (signal.aborted) return undefined;

    const diffOutput = mergeBase ? await run(["diff", "--numstat", `${mergeBase}..HEAD`]) : undefined;
    if (signal.aborted) return undefined;

    const parts: string[] = [];
    if (divergenceOutput) {
      const [behind, ahead] = divergenceOutput.split(/\s+/).map(Number);
      const divergence = [ahead ? `↑${ahead}` : undefined, behind ? `↓${behind}` : undefined].filter(Boolean).join(" ");
      if (divergence) parts.push(divergence);
    }
    const diff = parseDiffNumstat(diffOutput ?? "");
    if (diff.files || diff.added || diff.removed) parts.push(`${diff.files}f +${diff.added} -${diff.removed}`);
    return parts.length ? parts.join(" ") : undefined;
  } catch {
    return undefined;
  }
}

function renderCompactStatus(
  model: string,
  context: string | undefined,
  branch: string | null,
  gitDetails: string | undefined,
  optionalChunks: string[],
  width: number,
  divider: string,
  styleGit: (value: string) => string,
): string[] {
  const availableWidth = Math.max(1, width);
  if (visibleWidth(model) > availableWidth) return [truncateToWidth(model, availableWidth, "")];

  let line = model;
  if (context) {
    const candidate = `${line}${divider}${context}`;
    if (visibleWidth(candidate) > availableWidth) return [line];
    line = candidate;
  }

  if (branch) {
    const gitWidth = availableWidth - visibleWidth(line) - visibleWidth(divider);
    const fittedGit = fitGitText(branch, gitDetails, gitWidth);
    if (fittedGit) line += `${divider}${styleGit(fittedGit)}`;
  }

  const retained = optionalChunks.map(() => false);
  let retainedWidth = visibleWidth(line);
  for (let index = optionalChunks.length - 1; index >= 0; index--) {
    const candidateWidth = retainedWidth + visibleWidth(divider) + visibleWidth(optionalChunks[index]);
    if (candidateWidth <= availableWidth) {
      retained[index] = true;
      retainedWidth = candidateWidth;
    }
  }
  for (let index = 0; index < optionalChunks.length; index++) {
    if (retained[index]) line += `${divider}${optionalChunks[index]}`;
  }

  return [line];
}

function gitText(branch: string, details: string | undefined): string {
  return `${branch}${details ? ` ${details}` : ""}`;
}

function fitGitText(branch: string, details: string | undefined, width: number): string | undefined {
  if (width <= 0) return undefined;
  const full = gitText(branch, details);
  if (visibleWidth(full) <= width) return full;
  if (!details) return truncateToWidth(branch, width, "…");

  const detailsWidth = visibleWidth(details);
  if (detailsWidth >= width) return truncateToWidth(details, width, "…");
  const branchWidth = width - detailsWidth - 1;
  return branchWidth > 0 ? gitText(truncateToWidth(branch, branchWidth, "…"), details) : details;
}
function summarizeUsage(entries: Array<{ type: string; message?: unknown }>) {
  let input = 0; let output = 0; let cost = 0;
  for (const entry of entries) {
    const raw = entry.message as { role?: string } | undefined;
    if (entry.type !== "message" || raw?.role !== "assistant") continue;
    const message = raw as AssistantMessage;
    input += message.usage?.input ?? 0; output += message.usage?.output ?? 0; cost += message.usage?.cost?.total ?? 0;
  }
  return { input, output, total: input + output, cost };
}
function shortThinking(level: ThinkingLevel): string { return level === "minimal" ? "min" : level === "medium" ? "med" : level === "xhigh" ? "xhi" : level; }
function parseDiffNumstat(value: string): { files: number; added: number; removed: number } {
  let files = 0; let added = 0; let removed = 0;
  for (const line of value.split("\n")) {
    if (!line.trim()) continue;
    const [a, r] = line.split("\t"); files++; added += a === "-" ? 0 : Number(a || 0); removed += r === "-" ? 0 : Number(r || 0);
  }
  return { files, added, removed };
}
function formatCwd(cwd: string): string { const home = process.env.HOME; return home && cwd.startsWith(home) ? `~${cwd.slice(home.length) || ""}` : cwd; }
function fmt(value: number): string { return value < 1000 ? String(value) : value < 1_000_000 ? `${(value / 1000).toFixed(value < 10_000 ? 1 : 0)}k` : `${(value / 1_000_000).toFixed(1)}m`; }
function stripAnsi(value: string): string { return value.replace(/\x1b\[[0-9;]*m/g, ""); }
