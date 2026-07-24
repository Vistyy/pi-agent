import {
  existsSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import type {
  BeforeAgentStartEvent,
  ExtensionAPI,
  ToolCallEvent,
} from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, test } from "vitest";
import { registerSubagentSandbox } from "../index.js";

type Handler = (event: never, context: never) => unknown;

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function registerSandbox(existingScratchRoot?: string) {
  const scratchRoot =
    existingScratchRoot ??
    mkdtempSync(path.join(tmpdir(), "subagent-sandbox-extension-"));
  if (!existingScratchRoot) temporaryDirectories.push(scratchRoot);
  const handlers = new Map<string, Handler>();
  const pi = {
    on(event: string, handler: Handler) {
      handlers.set(event, handler);
    },
  } as unknown as ExtensionAPI;

  registerSubagentSandbox(pi, { homeDir: homedir(), scratchRoot });
  return { handlers, scratchRoot };
}

describe("subagent sandbox extension", () => {
  test("publishes the disposable-write contract and cleans its scratch directory", () => {
    const { handlers, scratchRoot } = registerSandbox();
    handlers.get("session_start")?.(undefined as never, undefined as never);

    const result = handlers.get("before_agent_start")?.(
      {
        type: "before_agent_start",
        prompt: "Investigate.",
        systemPrompt: "Base prompt.",
        systemPromptOptions: { cwd: "/workspace", contextFiles: [] },
      } as BeforeAgentStartEvent as never,
      undefined as never,
    ) as { systemPrompt: string };

    const runDirectories = readdirSync(scratchRoot);
    expect(result.systemPrompt).toContain("## Disposable worker filesystem");
    expect(result.systemPrompt).toContain("$TMPDIR");
    expect(result.systemPrompt).toContain(
      "The edit and write tools accept only absolute paths inside this scratch directory.",
    );
    expect(result.systemPrompt).toContain(path.join(scratchRoot, runDirectories[0], "scratch"));
    expect(result.systemPrompt).toContain("A continued worker receives a new empty scratch directory.");
    expect(runDirectories).toHaveLength(1);

    handlers.get("session_shutdown")?.(undefined as never, undefined as never);
    expect(readdirSync(scratchRoot)).toHaveLength(0);
  });

  test("a continuation runtime receives a fresh scratch path", () => {
    const first = registerSandbox();
    first.handlers.get("session_start")?.(undefined as never, undefined as never);
    const firstRun = readdirSync(first.scratchRoot)[0];
    const firstScratch = path.join(first.scratchRoot, firstRun, "scratch");
    const marker = path.join(firstScratch, "marker");
    writeFileSync(marker, "first turn\n");

    first.handlers.get("session_shutdown")?.(undefined as never, undefined as never);
    const continuation = registerSandbox(first.scratchRoot);
    continuation.handlers.get("session_start")?.(undefined as never, undefined as never);
    const continuationRun = readdirSync(first.scratchRoot)[0];
    const continuationScratch = path.join(
      first.scratchRoot,
      continuationRun,
      "scratch",
    );

    expect(continuationScratch).not.toBe(firstScratch);
    expect(existsSync(marker)).toBe(false);
    expect(existsSync(continuationScratch)).toBe(true);
    continuation.handlers.get("session_shutdown")?.(
      undefined as never,
      undefined as never,
    );
  });

  test.each(["edit", "write"])(
    "allows the %s tool for an absolute scratch path",
    (toolName) => {
      const { handlers, scratchRoot } = registerSandbox();
      handlers.get("session_start")?.(undefined as never, undefined as never);
      const runDirectory = readdirSync(scratchRoot)[0];
      const scratchDir = path.join(scratchRoot, runDirectory, "scratch");
      const result = handlers.get("tool_call")?.(
        {
          type: "tool_call",
          toolCallId: `${toolName}-call`,
          toolName,
          input: { path: path.join(scratchDir, "prototype.txt") },
        } as ToolCallEvent as never,
        undefined as never,
      );

      expect(result).toBeUndefined();
      handlers.get("session_shutdown")?.(
        undefined as never,
        undefined as never,
      );
    },
  );

  test.each(["edit", "write"])(
    "blocks the %s tool outside scratch",
    (toolName) => {
      const { handlers, scratchRoot } = registerSandbox();
      handlers.get("session_start")?.(undefined as never, undefined as never);
      const runDirectory = readdirSync(scratchRoot)[0];
      const scratchDir = path.join(scratchRoot, runDirectory, "scratch");
      const result = handlers.get("tool_call")?.(
        {
          type: "tool_call",
          toolCallId: `${toolName}-call`,
          toolName,
          input: { path: "/workspace/project-file.ts" },
        } as ToolCallEvent as never,
        undefined as never,
      );

      expect(result).toEqual({
        block: true,
        reason: `Subagent sandbox: ${toolName} accepts only absolute paths inside ${scratchDir}.`,
      });
      handlers.get("session_shutdown")?.(
        undefined as never,
        undefined as never,
      );
    },
  );

  test("wraps Bash commands after preserving their original text", () => {
    const { handlers } = registerSandbox();
    const input = { command: "printf marker > result.txt" };
    const event = {
      type: "tool_call",
      toolCallId: "bash-call",
      toolName: "bash",
      input,
    } as ToolCallEvent;

    handlers.get("tool_call")?.(event as never, undefined as never);

    expect(input.command).toContain("bwrap");
    expect(input.command).toContain("printf marker > result.txt");
    handlers.get("session_shutdown")?.(undefined as never, undefined as never);
  });
});
