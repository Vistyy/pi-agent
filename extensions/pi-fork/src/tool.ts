import { StringEnum, Type } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { EFFORT_LEVELS, loadConfig, type ForkConfig } from "./config.js";
import { type ForkDetails, type ForkEffort, type ForkEffortSource, type ForkEffortState, type ForkResult, emptyUsage, isResultError } from "./core/types.js";
import { getResultSummaryText } from "./child-events/index.js";
import { runFork } from "./runner/index.js";
import { renderForkCall, renderForkResult } from "./ui/render.js";

export const FORK_SYSTEM_PROMPT = `Fork policy:
Use fork for discovery.
If you do not already know the answer, and the needed investigation is bounded and separable, call fork first.
Do not do a quick grep/read/bash first to see if fork is necessary. That discovery belongs in the fork.
If the user names separate independent areas, use separate fork calls.
Use parent tools only for known-local checks, edits, coordination, or non-separable work.
Effort: fast = narrow lookup. balanced = investigation with judgment. deep = required for high-confidence risk review, especially process boundaries, command/env construction, safety/security, lifecycle, leakage, concurrency, or failure modes.`;

export const FORK_TOOL_TEXT = {
  taskDescription:
    "Bounded child task. Include scope, expected output, and limits. The child reports findings; it does not decide outside the task.",
  effortDescription:
    "Child work budget: fast for narrow lookup, balanced for investigation with judgment, deep for high-confidence risk review. Use deep, not balanced, for process boundaries, command/env construction, safety/security, lifecycle, leakage, concurrency, or failure modes.",
  description:
    "Delegate bounded discovery or review to a child Pi process on the current branch. The child investigates independently and returns a dense report.",
  promptSnippet:
    "Use fork({ task, effort }) for bounded, separable discovery or review. If you do not already know the answer, fork first instead of probing with read/bash.",
  promptGuidelines: [
    "Use fork for discovery.",
    "Known answer → answer directly.",
    "Unknown + bounded/separable investigation → fork first.",
    "Do not run read/bash/rg/find first to see whether fork is necessary. Put that search in the fork task.",
    "If the user names separate independent areas, use separate fork calls.",
    "Parent tools are for known-local checks, edits, coordination, or non-separable work.",
    "Use fast for narrow lookup; balanced for investigation with judgment.",
    "Use deep, not balanced, for high-confidence risk review: process boundaries, command/env construction, safety/security, lifecycle, leakage, concurrency, or failure modes.",
  ],
} as const;

const ForkParams = Type.Object({
  task: Type.String({
    description: FORK_TOOL_TEXT.taskDescription,
  }),
  effort: Type.Optional(StringEnum(EFFORT_LEVELS, {
    description: FORK_TOOL_TEXT.effortDescription,
  })),
});

interface SessionSnapshotSource {
  getHeader: () => unknown;
  getBranch: () => unknown[];
}

function buildForkSessionSnapshotJsonl(
  sessionManager: SessionSnapshotSource,
): string | null {
  const header = sessionManager.getHeader();
  if (!header || typeof header !== "object") return null;

  const branchEntries = sessionManager.getBranch();
  const lines = [JSON.stringify(header)];
  for (const entry of branchEntries) lines.push(JSON.stringify(entry));
  return `${lines.join("\n")}\n`;
}

function makeDetails(results: ForkResult[]): ForkDetails {
  return { results };
}

function resolveEffortState(
  requestedEffort: unknown,
  config: ForkConfig,
): ForkEffortState | undefined {
  const selected = EFFORT_LEVELS.includes(requestedEffort as ForkEffort)
    ? requestedEffort as ForkEffort
    : config.defaultEffort;
  if (!selected) return undefined;

  const source: ForkEffortSource = requestedEffort === selected ? "tool" : "default";
  const profile = config.effortProfiles?.[selected];
  if (profile) return { selected, source, profile };

  return {
    selected,
    source,
    warning: source === "tool"
      ? `Requested effort \"${selected}\" has no configured profile; using child Pi defaults.`
      : undefined,
  };
}

function formatResultContent(result: ForkResult, isError: boolean): string {
  const warning = result.effort?.warning ? `Fork warning: ${result.effort.warning}\n\n` : "";
  const summary = getResultSummaryText(result);
  if (isError) return `${warning}Fork ${result.stopReason || "failed"}: ${summary}`;
  return `${warning}${summary}`;
}

export function resolveModelContextWindow(
  modelRegistry: ExtensionContext["modelRegistry"],
  provider?: string,
  model?: string,
): number | undefined {
  const trimmedProvider = provider?.trim();
  const trimmedModel = model?.trim();
  if (!trimmedModel) return undefined;

  const attempts: Array<[string, string]> = [];
  if (trimmedProvider) {
    attempts.push([trimmedProvider, trimmedModel]);
    if (trimmedModel.startsWith(`${trimmedProvider}/`)) {
      attempts.push([trimmedProvider, trimmedModel.slice(trimmedProvider.length + 1)]);
    }
  } else {
    const slashIndex = trimmedModel.indexOf("/");
    if (slashIndex > 0 && slashIndex < trimmedModel.length - 1) {
      attempts.push([trimmedModel.slice(0, slashIndex), trimmedModel.slice(slashIndex + 1)]);
    }
  }

  for (const [attemptProvider, attemptModel] of attempts) {
    const found = modelRegistry.find(attemptProvider, attemptModel);
    const contextWindow = found?.contextWindow;
    if (typeof contextWindow === "number" && Number.isFinite(contextWindow) && contextWindow > 0) {
      return contextWindow;
    }
  }

  return undefined;
}

function emptyFailedResult(task: string, message: string): ForkResult {
  return {
    task,
    exitCode: 1,
    messages: [],
    stderr: message,
    usage: emptyUsage(),
    stopReason: "error",
    errorMessage: message,
  };
}

export function registerForkTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "fork",
    label: "Fork",
    description: FORK_TOOL_TEXT.description,
    promptSnippet: FORK_TOOL_TEXT.promptSnippet,
    promptGuidelines: [...FORK_TOOL_TEXT.promptGuidelines],
    executionMode: "parallel",
    parameters: ForkParams,
    renderCall: renderForkCall,
    renderResult: renderForkResult,

    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      const config = loadConfig(ctx.cwd);
      const effort = resolveEffortState(params.effort, config);
      const snapshot = buildForkSessionSnapshotJsonl(ctx.sessionManager);
      if (!snapshot) {
        const result = emptyFailedResult(
          params.task,
          "Cannot fork: failed to snapshot current session context.",
        );
        if (effort) result.effort = effort;
        return {
          content: [{ type: "text" as const, text: formatResultContent(result, true) }],
          details: makeDetails([result]),
          isError: true,
        };
      }

      const result = await runFork({
        cwd: ctx.cwd,
        task: params.task,
        forkSessionSnapshotJsonl: snapshot,
        extensions: config.extensions,
        environment: config.environment,
        offline: config.offline,
        signal,
        onUpdate,
        makeDetails,
        effort,
        resolveContextWindow: (provider, model) => resolveModelContextWindow(ctx.modelRegistry, provider, model),
      });

      if (isResultError(result)) {
        return {
          content: [
            {
              type: "text" as const,
              text: formatResultContent(result, true),
            },
          ],
          details: makeDetails([result]),
          isError: true,
        };
      }

      return {
        content: [{ type: "text" as const, text: formatResultContent(result, false) }],
        details: makeDetails([result]),
      };
    },
  });
}
