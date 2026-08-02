import { describe, expect, it, vi } from "vitest";
import type { Theme } from "@earendil-works/pi-coding-agent";
import { formatByteSize, sanitizeTerminalText } from "../src/format.js";
import { ToolLensComponent } from "../src/ui.js";

const theme = {
  bg: (_name: string, text: string) => text,
  fg: (_name: string, text: string) => text,
  bold: (text: string) => text,
} as unknown as Theme;

const KEY = {
  enter: "\r",
  escape: "\u001b",
  down: "\u001b[B",
  ctrlD: "\u0004",
  ctrlU: "\u0015",
  home: "\u001b[H",
  end: "\u001b[F",
};

function result(overrides: Partial<any> = {}): any {
  return {
    toolCallId: "call-1",
    toolName: "read",
    invocation: "README.md",
    args: { path: "README.md" },
    content: [{ type: "text", text: "line one\nline two" }],
    details: undefined,
    isError: false,
    resultSummary: "2 lines",
    tokenUsage: { input: 5, output: 8, total: 13 },
    ...overrides,
  };
}

describe("ToolLensComponent", () => {
  it("shows empty and filtered list states", () => {
    const close = vi.fn();
    const render = new ToolLensComponent([], theme, close, vi.fn());
    expect(render.render(80).join("\n")).toContain("No completed tool");
    expect(render.render(80).join("\n")).toContain("results on active");
    expect(render.render(80).join("\n")).toContain("branch.");

    const filtered = new ToolLensComponent([result()], theme, close, vi.fn());
    for (const key of "missing") filtered.handleInput(key);
    expect(filtered.render(80).join("\n")).toContain("No matching tool");
    expect(filtered.render(80).join("\n")).toContain("results.");
  });

  it("shows the selected result beside the list and updates the preview with selection", () => {
    const close = vi.fn();
    const component = new ToolLensComponent(
      [result({ content: [{ type: "text", text: "\u001b[31m1234567890\u001b[0m" }], resultSummary: "1 line" }), result({ toolCallId: "call-2", toolName: "custom", invocation: "run", isError: true, content: [], resultSummary: "failed" })],
      theme,
      close,
      vi.fn(),
    );
    const initial = component.render(88).join("\n");
    expect(initial).toContain("read  README.md");
    expect(initial).toContain("1234567890");
    expect(initial).toContain("↑5 ↓8 (13)");
    expect(initial).toContain("Ctrl+U/D page");
    expect(initial).not.toContain("\\u001b");
    expect(component.render(40)[0]).toContain("╭");

    component.handleInput(KEY.down);
    expect(component.render(88).join("\n")).toContain("Tool failed without output");
    component.handleInput(KEY.escape);
    expect(close).toHaveBeenCalledOnce();

    const image = new ToolLensComponent([result({ content: [{ type: "image", mimeType: "image/png", data: "AQID" }], resultSummary: "image/png" })], theme, close, vi.fn());
    expect(image.render(88).join("\n")).toContain("Image: image/png");
    expect(image.render(88).join("\n")).not.toContain("(3 B)");
  });

  it("supports preview Home, End, Ctrl+U, and Ctrl+D navigation", () => {
    const long = Array.from({ length: 40 }, (_, index) => `line-${index}`).join("\n");
    const component = new ToolLensComponent([result({ content: [{ type: "text", text: long }] })], theme, vi.fn(), vi.fn());
    component.handleInput(KEY.end);
    expect(component.render(80).join("\n")).toContain("line-39");
    component.handleInput(KEY.home);
    expect(component.render(80).join("\n")).toContain("line-0");
    component.handleInput(KEY.ctrlD);
    expect(component.render(80).join("\n")).toContain("line-9");
    component.handleInput(KEY.ctrlU);
    expect(component.render(80).join("\n")).toContain("line-0");
  });

  it("fills the requested terminal-relative pane height", () => {
    const component = new ToolLensComponent([result()], theme, vi.fn(), vi.fn(), undefined, () => 30);
    expect(component.render(100)).toHaveLength(35);
  });
});

describe("format helpers", () => {
  it("uses human-readable byte units", () => {
    expect(formatByteSize(1536)).toBe("1.5 KB");
    expect(formatByteSize(2 * 1024 * 1024)).toBe("2 MB");
  });

  it("removes terminal control sequences while keeping text", () => {
    expect(sanitizeTerminalText("before\u001b[31mred\u001b[0mafter")).toBe("beforeredafter");
  });
});
