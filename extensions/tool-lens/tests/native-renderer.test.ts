import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { initTheme, type Theme } from "@earendil-works/pi-coding-agent";
import { createNativePreviewRenderer } from "../src/native-renderer.js";

const theme = {
  bg: (_name: string, text: string) => text,
  fg: (_name: string, text: string) => text,
  bold: (text: string) => text,
} as unknown as Theme;

function result(overrides: Record<string, unknown>): any {
  return {
    toolCallId: "call-1",
    toolName: "edit",
    invocation: "src/a.ts",
    args: { path: "src/a.ts", edits: [{ oldText: "old", newText: "new" }] },
    content: [{ type: "text", text: "Successfully replaced text in src/a.ts" }],
    details: { diff: "-1 old\n+1 new", firstChangedLine: 1 },
    isError: false,
    resultSummary: "+1 -1",
    tokenUsage: { input: 4, output: 8, total: 12 },
    ...overrides,
  };
}

const stripAnsi = (text: string) => text.replace(/\u001B\][^\u0007]*(?:\u0007|\u001B\\)|\u001B\[[0-?]*[ -/]*[@-~]|\u001B[@-_]/g, "");

describe("native result previews", () => {
  beforeAll(() => initTheme(undefined, false));
  it("uses Pi's expanded Edit renderer for persisted diffs", () => {
    const render = createNativePreviewRenderer("/tmp", theme);
    const rendered = render(result({}), 80).join("\n");
    const output = stripAnsi(rendered);
    expect(rendered).toContain("\u001b[");
    expect(output).toContain("old");
    expect(output).toContain("new");
    expect(output).not.toContain("Successfully replaced text");
  });

  it.each([
    ["read", { path: "a.txt" }, "read output"],
    ["bash", { command: "printf output" }, "bash output"],
    ["grep", { pattern: "needle", path: "." }, "a.txt:1:needle"],
    ["find", { pattern: "*.txt", path: "." }, "a.txt"],
    ["ls", { path: "." }, "a.txt"],
  ])("uses Pi's expanded %s result renderer", (toolName, args, text) => {
    const render = createNativePreviewRenderer("/tmp", theme);
    const output = stripAnsi(render(result({ toolName, args, content: [{ type: "text", text }], details: undefined }), 80).join("\n"));
    expect(output).toContain(text);
  });

  it("shows the complete content supplied to a successful Write call", () => {
    const render = createNativePreviewRenderer("/tmp", theme);
    const output = stripAnsi(render(result({
      toolName: "write",
      args: { path: "a.ts", content: "const answer = 42;\nexport { answer };\n" },
      content: [{ type: "text", text: "Successfully wrote 38 bytes to a.ts" }],
      details: undefined,
    }), 80).join("\n"));
    expect(output).toContain("const answer = 42;");
    expect(output).toContain("export { answer };");
    expect(output).not.toContain("Successfully wrote 38 bytes");
  });

  it("shows the stored error from a failed Write call", () => {
    const render = createNativePreviewRenderer("/tmp", theme);
    const output = stripAnsi(render(result({
      toolName: "write",
      args: { path: "a.ts", content: "not written" },
      content: [{ type: "text", text: "Permission denied" }],
      details: undefined,
      isError: true,
    }), 80).join("\n"));
    expect(output).toContain("Permission denied");
    expect(output).not.toContain("not written");
  });

  it("falls back instead of crashing when a native renderer lacks process-global state", () => {
    const output = execFileSync(
      resolve("node_modules/.bin/tsx"),
      ["tests/fixtures/bash-render-without-global-theme.ts"],
      { cwd: resolve("."), encoding: "utf8" },
    );
    expect(output).toContain("fallback output");
  });

  it("falls back to complete stored output for extension-owned tools", () => {
    const render = createNativePreviewRenderer("/tmp", theme);
    const output = render(result({ toolName: "custom_tool", content: [{ type: "text", text: "full\nstored\noutput" }] }), 80).join("\n");
    expect(output).toContain("full\nstored\noutput");
  });
});
