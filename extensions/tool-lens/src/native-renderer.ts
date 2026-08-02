import {
  createBashToolDefinition,
  createEditToolDefinition,
  createFindToolDefinition,
  createGrepToolDefinition,
  createLsToolDefinition,
  createReadToolDefinition,
  createWriteToolDefinition,
  type Theme,
  type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import type { ToolLensResult } from "./project.js";
import { resultBodyLines } from "./format.js";

const BUILTIN_NAMES = ["read", "write", "edit", "bash", "grep", "find", "ls"] as const;
type BuiltinName = (typeof BUILTIN_NAMES)[number];
type AnyDefinition = ToolDefinition<any, any, any>;

function definitions(cwd: string): Record<BuiltinName, AnyDefinition> {
  return {
    read: createReadToolDefinition(cwd),
    write: createWriteToolDefinition(cwd),
    edit: createEditToolDefinition(cwd),
    bash: createBashToolDefinition(cwd),
    grep: createGrepToolDefinition(cwd),
    find: createFindToolDefinition(cwd),
    ls: createLsToolDefinition(cwd),
  };
}

function hasVisibleContent(lines: string[]): boolean {
  const ansi = /\u001B\][^\u0007]*(?:\u0007|\u001B\\)|\u001B\[[0-?]*[ -/]*[@-~]|\u001B[@-_]/g;
  return lines.some((line) => line.replace(ansi, "").trim());
}

export type PreviewRenderer = (result: ToolLensResult, width: number) => string[];

export function createNativePreviewRenderer(cwd: string, theme: Theme): PreviewRenderer {
  const native = definitions(cwd);
  const cache = new Map<string, { component: ReturnType<NonNullable<AnyDefinition["renderResult"]>>; context: any }>();

  return (result, width) => {
    const definition = native[result.toolName as BuiltinName];
    if (!definition?.renderResult) return resultBodyLines(result, width);

    try {
      let cached = cache.get(result.toolCallId);
      if (!cached) {
        const context = {
          args: result.args,
          toolCallId: result.toolCallId,
          invalidate: () => {},
          lastComponent: undefined,
          state: {},
          cwd,
          executionStarted: true,
          argsComplete: true,
          isPartial: false,
          expanded: true,
          showImages: false,
          isError: result.isError,
        };
        const component = definition.renderResult(
          { content: result.content, details: result.details },
          { expanded: true, isPartial: false },
          theme,
          context,
        );
        cached = { component, context };
        cache.set(result.toolCallId, cached);
      }

      const lines = cached.component.render(Math.max(1, width));
      return hasVisibleContent(lines) ? lines : resultBodyLines(result, width);
    } catch {
      cache.delete(result.toolCallId);
      return resultBodyLines(result, width);
    }
  };
}
