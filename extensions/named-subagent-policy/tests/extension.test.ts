import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type {
  BeforeAgentStartEvent,
  ExtensionAPI,
  ExtensionContext,
  ToolCallEvent,
} from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, test } from "vitest";
import namedSubagentPolicy from "../index.js";

type Handler = (event: never, context: never) => unknown;

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function registerPolicy() {
  const handlers = new Map<string, Handler>();
  const pi = {
    on(event: string, handler: Handler) {
      handlers.set(event, handler);
    },
  } as unknown as ExtensionAPI;

  namedSubagentPolicy(pi);
  return handlers;
}

describe("named subagent policy", () => {
  test("unnamed subagent spawning is blocked", () => {
    const handler = registerPolicy().get("tool_call");
    const result = handler?.(
      {
        type: "tool_call",
        toolCallId: "unnamed-agent-call",
        toolName: "spawn_agent",
        input: {},
      } as ToolCallEvent as never,
      { mode: "print" } as ExtensionContext as never,
    );

    expect(result).toEqual({
      block: true,
      reason: "spawn_agent requires a named agent_type.",
    });
  });

  test("named subagent spawning is allowed", () => {
    const handler = registerPolicy().get("tool_call");
    const result = handler?.(
      {
        type: "tool_call",
        toolCallId: "named-agent-call",
        toolName: "spawn_agent",
        input: { agent_type: "fast" },
      } as ToolCallEvent as never,
      { mode: "print" } as ExtensionContext as never,
    );

    expect(result).toBeUndefined();
  });

  test("child RPC dialogs resolve immediately to denial defaults", async () => {
    const previousOwnerToken = process.env.PI_SUBAGENT_OWNER_TOKEN;
    process.env.PI_SUBAGENT_OWNER_TOKEN = "child-owner";
    try {
      const handler = registerPolicy().get("tool_call");
      const ui = {
        select: async () => "allow",
        confirm: async () => true,
        input: async () => "input",
        editor: async () => "content",
      };
      handler?.(
        {
          type: "tool_call",
          toolCallId: "child-bash-call",
          toolName: "bash",
          input: { command: "git push" },
        } as ToolCallEvent as never,
        { mode: "rpc", ui } as unknown as ExtensionContext as never,
      );

      await expect(ui.select()).resolves.toBeUndefined();
      await expect(ui.confirm()).resolves.toBe(false);
      await expect(ui.input()).resolves.toBeUndefined();
      await expect(ui.editor()).resolves.toBeUndefined();
    } finally {
      if (previousOwnerToken === undefined) {
        delete process.env.PI_SUBAGENT_OWNER_TOKEN;
      } else {
        process.env.PI_SUBAGENT_OWNER_TOKEN = previousOwnerToken;
      }
    }
  });

  test("applicable AGENTS.md guidance is added to the child system prompt", () => {
    const root = mkdtempSync(path.join(tmpdir(), "named-subagent-policy-"));
    temporaryDirectories.push(root);
    const agentDirectory = path.join(root, "agent-home");
    const repository = path.join(root, "repository");
    const workingDirectory = path.join(repository, "src");
    mkdirSync(agentDirectory, { recursive: true });
    mkdirSync(workingDirectory, { recursive: true });
    writeFileSync(
      path.join(repository, "AGENTS.md"),
      "Use the repository entry point. See [details](DETAILS.md).\n",
    );
    writeFileSync(path.join(repository, "DETAILS.md"), "Do not preload me.\n");
    writeFileSync(path.join(repository, "CLAUDE.md"), "Do not include me.\n");

    const previousAgentDirectory = process.env.PI_CODING_AGENT_DIR;
    const previousOwnerToken = process.env.PI_SUBAGENT_OWNER_TOKEN;
    process.env.PI_CODING_AGENT_DIR = agentDirectory;
    process.env.PI_SUBAGENT_OWNER_TOKEN = "child-owner";
    try {
      const handler = registerPolicy().get("before_agent_start");
      const result = handler?.(
        {
          type: "before_agent_start",
          prompt: "Investigate the task.",
          systemPrompt: "Base subagent prompt.",
          systemPromptOptions: {
            cwd: workingDirectory,
            contextFiles: [],
          },
        } as BeforeAgentStartEvent as never,
        { cwd: workingDirectory } as ExtensionContext as never,
      );

      expect(result).toEqual({
        systemPrompt: [
          "Base subagent prompt.",
          `<project-guidance source="${path.join(repository, "AGENTS.md")}">`,
          "Use the repository entry point. See [details](DETAILS.md).",
          "</project-guidance>",
        ].join("\n\n"),
      });
    } finally {
      if (previousAgentDirectory === undefined) {
        delete process.env.PI_CODING_AGENT_DIR;
      } else {
        process.env.PI_CODING_AGENT_DIR = previousAgentDirectory;
      }
      if (previousOwnerToken === undefined) {
        delete process.env.PI_SUBAGENT_OWNER_TOKEN;
      } else {
        process.env.PI_SUBAGENT_OWNER_TOKEN = previousOwnerToken;
      }
    }
  });

  test("global and project AGENTS.md guidance are both added", () => {
    const root = mkdtempSync(path.join(tmpdir(), "named-subagent-policy-"));
    temporaryDirectories.push(root);
    const agentDirectory = path.join(root, "agent-home");
    const repository = path.join(root, "repository");
    mkdirSync(agentDirectory, { recursive: true });
    mkdirSync(repository, { recursive: true });
    writeFileSync(path.join(agentDirectory, "AGENTS.md"), "Global guidance.\n");
    writeFileSync(path.join(repository, "AGENTS.md"), "Project guidance.\n");

    const previousAgentDirectory = process.env.PI_CODING_AGENT_DIR;
    const previousOwnerToken = process.env.PI_SUBAGENT_OWNER_TOKEN;
    process.env.PI_CODING_AGENT_DIR = agentDirectory;
    process.env.PI_SUBAGENT_OWNER_TOKEN = "child-owner";
    try {
      const handler = registerPolicy().get("before_agent_start");
      const result = handler?.(
        {
          type: "before_agent_start",
          prompt: "Investigate the task.",
          systemPrompt: "Base subagent prompt.",
          systemPromptOptions: { cwd: repository, contextFiles: [] },
        } as BeforeAgentStartEvent as never,
        { cwd: repository } as ExtensionContext as never,
      );

      expect(result).toEqual({
        systemPrompt: [
          "Base subagent prompt.",
          `<project-guidance source="${path.join(agentDirectory, "AGENTS.md")}">`,
          "Global guidance.",
          "</project-guidance>",
          `<project-guidance source="${path.join(repository, "AGENTS.md")}">`,
          "Project guidance.",
          "</project-guidance>",
        ].join("\n\n"),
      });
    } finally {
      if (previousAgentDirectory === undefined) {
        delete process.env.PI_CODING_AGENT_DIR;
      } else {
        process.env.PI_CODING_AGENT_DIR = previousAgentDirectory;
      }
      if (previousOwnerToken === undefined) {
        delete process.env.PI_SUBAGENT_OWNER_TOKEN;
      } else {
        process.env.PI_SUBAGENT_OWNER_TOKEN = previousOwnerToken;
      }
    }
  });

  test("AGENTS.md already loaded by Pi is not duplicated", () => {
    const root = mkdtempSync(path.join(tmpdir(), "named-subagent-policy-"));
    temporaryDirectories.push(root);
    const agentDirectory = path.join(root, "agent-home");
    const repository = path.join(root, "repository");
    const agentsPath = path.join(repository, "AGENTS.md");
    mkdirSync(agentDirectory, { recursive: true });
    mkdirSync(repository, { recursive: true });
    writeFileSync(agentsPath, "Existing guidance.\n");

    const previousAgentDirectory = process.env.PI_CODING_AGENT_DIR;
    const previousOwnerToken = process.env.PI_SUBAGENT_OWNER_TOKEN;
    process.env.PI_CODING_AGENT_DIR = agentDirectory;
    process.env.PI_SUBAGENT_OWNER_TOKEN = "child-owner";
    try {
      const handler = registerPolicy().get("before_agent_start");
      const result = handler?.(
        {
          type: "before_agent_start",
          prompt: "Investigate the task.",
          systemPrompt: "Base prompt with existing guidance.",
          systemPromptOptions: {
            cwd: repository,
            contextFiles: [
              { path: agentsPath, content: "Existing guidance.\n" },
            ],
          },
        } as BeforeAgentStartEvent as never,
        { cwd: repository } as ExtensionContext as never,
      );

      expect(result).toBeUndefined();
    } finally {
      if (previousAgentDirectory === undefined) {
        delete process.env.PI_CODING_AGENT_DIR;
      } else {
        process.env.PI_CODING_AGENT_DIR = previousAgentDirectory;
      }
      if (previousOwnerToken === undefined) {
        delete process.env.PI_SUBAGENT_OWNER_TOKEN;
      } else {
        process.env.PI_SUBAGENT_OWNER_TOKEN = previousOwnerToken;
      }
    }
  });
});
