import {
  createBashToolDefinition,
  createEditToolDefinition,
  createFindToolDefinition,
  createGrepToolDefinition,
  createLsToolDefinition,
  createReadToolDefinition,
  createWriteToolDefinition,
  getAgentDir,
  SettingsManager,
  type ExtensionContext,
  type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { Container } from "@earendil-works/pi-tui";
import type { ToolCardInput, StoredToolResult } from "./summaries.js";
import { renderToolCard } from "./renderer.js";
import { TOOL_NAMES, type ToolCardRenderState, type ToolName } from "./types.js";

export type AnyToolDefinition = ToolDefinition<any, any, ToolCardRenderState>;

function settingsOptions(settings: SettingsManager) {
  return {
    read: { autoResizeImages: settings.getImageAutoResize() },
    bash: { shellPath: settings.getShellPath(), commandPrefix: settings.getShellCommandPrefix() },
  };
}

function asStoredResult(result: { content: Array<{ type: string; text?: string; data?: string; mimeType?: string }>; details?: unknown }): StoredToolResult {
  const content: StoredToolResult["content"] = [];
  for (const part of result.content) {
    if (part.type === "text" && typeof part.text === "string") content.push({ type: "text", text: part.text });
    if (part.type === "image" && typeof part.data === "string" && typeof part.mimeType === "string") content.push({ type: "image", data: part.data, mimeType: part.mimeType });
  }
  return { content, details: result.details };
}

function withCardRenderer(definition: AnyToolDefinition, name: ToolName): AnyToolDefinition {
  return {
    ...definition,
    renderShell: "self",
    renderCall(args, theme, context) {
      if (!context.isPartial) return new Container();
      return renderToolCard(name, args as Record<string, unknown> | undefined, theme, {
        state: context.state,
        executionStarted: context.executionStarted,
        expanded: context.expanded,
        isPartial: true,
        isError: false,
      });
    },
    renderResult(result, options, theme, context) {
      if (options.isPartial) return new Container();
      return renderToolCard(name, context.args as Record<string, unknown> | undefined, theme, {
        state: context.state,
        executionStarted: context.executionStarted,
        expanded: options.expanded,
        isPartial: false,
        isError: context.isError,
      }, asStoredResult(result));
    },
  };
}

function dynamicDefinition(
  name: "read" | "bash",
  cwd: string,
  settings: SettingsManager,
): AnyToolDefinition {
  const create = () => name === "read"
    ? createReadToolDefinition(cwd, settingsOptions(settings).read)
    : createBashToolDefinition(cwd, settingsOptions(settings).bash);
  const initial = create() as AnyToolDefinition;
  return {
    ...initial,
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      await settings.reload();
      const current = create();
      return current.execute(toolCallId, params as never, signal, onUpdate, ctx);
    },
  };
}

function staticDefinition(name: Exclude<ToolName, "read" | "bash">, cwd: string): AnyToolDefinition {
  switch (name) {
    case "write":
      return createWriteToolDefinition(cwd) as AnyToolDefinition;
    case "edit":
      return createEditToolDefinition(cwd) as AnyToolDefinition;
    case "grep":
      return createGrepToolDefinition(cwd) as AnyToolDefinition;
    case "find":
      return createFindToolDefinition(cwd) as AnyToolDefinition;
    case "ls":
      return createLsToolDefinition(cwd) as AnyToolDefinition;
  }
}

export function createToolCardDefinitions(cwd: string, settings: SettingsManager): Record<ToolName, AnyToolDefinition> {
  const definitions = {
    read: withCardRenderer(dynamicDefinition("read", cwd, settings), "read"),
    write: withCardRenderer(staticDefinition("write", cwd), "write"),
    edit: withCardRenderer(staticDefinition("edit", cwd), "edit"),
    bash: withCardRenderer(dynamicDefinition("bash", cwd, settings), "bash"),
    grep: withCardRenderer(staticDefinition("grep", cwd), "grep"),
    find: withCardRenderer(staticDefinition("find", cwd), "find"),
    ls: withCardRenderer(staticDefinition("ls", cwd), "ls"),
  } satisfies Record<ToolName, AnyToolDefinition>;
  return definitions;
}

export function createSettingsManager(ctx: Pick<ExtensionContext, "cwd" | "isProjectTrusted">): SettingsManager {
  return SettingsManager.create(ctx.cwd, getAgentDir(), { projectTrusted: ctx.isProjectTrusted() });
}

export function findToolConflicts(pi: { getAllTools(): Array<{ name: string; sourceInfo: { source: string } }> }): string[] {
  return pi.getAllTools()
    .filter((tool) => TOOL_NAMES.includes(tool.name as ToolName) && tool.sourceInfo.source !== "builtin")
    .map((tool) => `${tool.name} (${tool.sourceInfo.source})`);
}

export function toolCardInputFromResult(
  name: ToolName,
  args: Record<string, unknown> | undefined,
  result: { content: Array<{ type: string; text?: string; data?: string; mimeType?: string }>; details?: unknown },
  isError: boolean,
): ToolCardInput {
  return { name, args, result: asStoredResult(result), isError };
}
