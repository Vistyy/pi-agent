import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { estimateTokenUsage, filterToolResults, projectToolResults, summarizeResult } from "../src/project.js";

function entry(id: string, message: unknown, parentId: string | null = null) {
  return { type: "message", id, parentId, timestamp: `2026-01-01T00:00:0${id.length}Z`, message } as any;
}

function assistant(...calls: Array<{ id: string; name: string; arguments: Record<string, unknown> }>) {
  return {
    role: "assistant",
    content: calls.map((call) => ({ type: "toolCall", ...call })),
    api: "test",
    provider: "test",
    model: "test",
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
    stopReason: "toolUse",
    timestamp: 0,
  };
}

function result(toolCallId: string, toolName: string, content: unknown[], isError = false, details?: unknown) {
  return { role: "toolResult", toolCallId, toolName, content, isError, details, timestamp: 0 };
}

describe("projectToolResults", () => {
  it("pairs parallel results by toolCallId and orders them newest first", () => {
    const branch = [
      entry("assistant", assistant(
        { id: "a", name: "alpha", arguments: { path: "a.txt" } },
        { id: "b", name: "beta", arguments: { path: "b.txt" } },
      )),
      entry("result-b", result("b", "beta", [{ type: "text", text: "B" }])),
      entry("result-a", result("a", "alpha", [{ type: "text", text: "A" }])),
    ];

    expect(projectToolResults(branch).map((item) => [item.toolCallId, item.toolName, item.invocation])).toEqual([
      ["a", "alpha", "{\"path\":\"a.txt\"}"],
      ["b", "beta", "{\"path\":\"b.txt\"}"],
    ]);
    expect(projectToolResults([
      entry("read-assistant", assistant({ id: "read", name: "read", arguments: { path: "file.txt", offset: 10, limit: 5 } })),
      entry("read-result", result("read", "read", [{ type: "text", text: "line" }])),
    ])[0].invocation).toBe("file.txt:10-14");
    expect(projectToolResults([
      entry("limited-read-assistant", assistant({ id: "limited-read", name: "read", arguments: { path: "file.txt", limit: 5 } })),
      entry("limited-read-result", result("limited-read", "read", [{ type: "text", text: "line" }])),
    ])[0].invocation).toBe("file.txt:1-5");
  });

  it("keeps failures and extension-owned tools, but excludes unmatched calls and user shell messages", () => {
    const branch = [
      entry("assistant", assistant(
        { id: "failed", name: "custom_tool", arguments: { action: "run" } },
        { id: "missing", name: "missing", arguments: {} },
      )),
      entry("failure", result("failed", "custom_tool", [{ type: "text", text: "\u001b[31mfailed\u001b[0m" }], true)),
      entry("shell", { role: "bashExecution", command: "echo ignored", output: "ignored" }),
      entry("unmatched", result("unknown", "other", [{ type: "text", text: "not shown" }])),
    ];

    expect(projectToolResults(branch)).toMatchObject([
      { toolCallId: "failed", toolName: "custom_tool", isError: true, content: [{ type: "text", text: "\u001b[31mfailed\u001b[0m" }] },
    ]);
  });

  it("keeps completed results when compaction entries occur on the branch", () => {
    const branch = [
      entry("assistant", assistant({ id: "before-compaction", name: "read", arguments: { path: "kept.txt" } })),
      { type: "compaction", id: "compaction", parentId: "assistant", timestamp: "2026-01-01T00:00:01Z", summary: "summary" } as any,
      entry("result", result("before-compaction", "read", [{ type: "text", text: "kept" }])),
    ];
    expect(projectToolResults(branch).map((item) => item.invocation)).toEqual(["kept.txt"]);
  });

  it("summarizes results in operator-friendly terms", () => {
    expect(summarizeResult([{ type: "text", text: "one\ntwo\n" }], false)).toBe("2 lines");
    expect(summarizeResult([{ type: "image", mimeType: "image/png", data: "AQID" }], false)).toBe("image/png");
    expect(summarizeResult([
      { type: "text", text: "one\ntwo" },
      { type: "image", mimeType: "image/png", data: "AQID" },
    ], false)).toBe("2 lines + 1 image");
    expect(summarizeResult([], false)).toBe("no output");
    expect(summarizeResult([{ type: "text", text: "details" }], true)).toBe("failed");
    const usage = estimateTokenUsage("read", { path: "README.md" }, [{ type: "text", text: "one two three four" }]);
    expect(usage.input).toBeGreaterThan(0);
    expect(usage.output).toBeGreaterThan(0);
    expect(usage.total).toBe(usage.input + usage.output);
  });

  it("filters only tool names and compact invocations", () => {
    const results = projectToolResults([
      entry("assistant", assistant({ id: "a", name: "read", arguments: { path: "needle.txt" } })),
      entry("result", result("a", "read", [{ type: "text", text: "body-only-needle" }])),
    ]);
    expect(filterToolResults(results, "body-only-needle")).toHaveLength(0);
    expect(filterToolResults(results, "needle.txt")).toHaveLength(1);
  });

  it("projects the same branch after a persisted SessionManager resume", async () => {
    const root = await mkdtemp(join(tmpdir(), "pi-tool-lens-"));
    try {
      const manager = SessionManager.create("/tmp/tool-lens-test", root);
      manager.appendMessage(assistant({ id: "persisted", name: "read", arguments: { path: "resume.txt" } }) as any);
      manager.appendMessage(result("persisted", "read", [{ type: "text", text: "persisted" }]) as any);
      const sessionFile = manager.getSessionFile();
      expect(sessionFile).toBeTruthy();
      const resumed = SessionManager.open(sessionFile!, root);
      expect(projectToolResults(resumed.getBranch())).toEqual(projectToolResults(manager.getBranch()));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
