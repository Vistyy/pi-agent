import { describe, expect, it, vi } from "vitest";

const mockRunFork = vi.hoisted(() => vi.fn());

vi.mock("../src/runner/index.js", () => ({ runFork: mockRunFork }));
vi.mock("../src/config.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/config.js")>();
  return { ...actual, loadConfig: () => ({ extensions: [], environment: {}, tools: null, offline: true, costFooter: true, defaultEffort: "balanced" }) };
});

import { PI_USAGE_RECORDED } from "../../pi-cost/src/types.js";
import { registerForkTool } from "../src/tool.js";

describe("fork tool usage recording", () => {
  it("records generic usage with effort tag", async () => {
    let execute: any;
    const appendEntry = vi.fn();
    const pi = {
      appendEntry,
      registerTool: vi.fn((tool) => { execute = tool.execute; }),
    } as any;
    registerForkTool(pi);
    mockRunFork.mockResolvedValueOnce({
      task: "investigate",
      exitCode: 0,
      messages: [{ role: "assistant", content: [{ type: "text", text: "done" }] }],
      stderr: "",
      usage: { input: 10, output: 5, cacheRead: 3, cacheWrite: 2, cost: 0.25, contextTokens: 20, turns: 1 },
      provider: "anthropic",
      model: "claude",
      stopReason: "stop",
      sawAgentEnd: true,
      effort: { selected: "deep", source: "tool" },
    });

    await execute("call-1", { task: "investigate", effort: "deep" }, undefined, undefined, {
      cwd: "/tmp/project",
      modelRegistry: { find: vi.fn() },
      sessionManager: { getHeader: () => ({ type: "header" }), getBranch: () => [] },
    });

    expect(appendEntry).toHaveBeenCalledWith(PI_USAGE_RECORDED, expect.objectContaining({
      extension: "fork",
      agent: "child-agent",
      operation: "fork",
      tags: { effort: "deep" },
      usage: expect.objectContaining({ input: 10, output: 5, cacheRead: 3, cacheWrite: 2, totalTokens: 20, cost: 0.25 }),
    }));
  });
});
