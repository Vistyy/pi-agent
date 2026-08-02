import { Theme, type ThemeColor } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { SettingsManager } from "@earendil-works/pi-coding-agent";
import { renderToolCard } from "../src/renderer.js";
import { createToolCardDefinitions } from "../src/tools.js";
import type { ToolCardRenderState } from "../src/types.js";

const theme = new Theme(
  Object.fromEntries([
    "accent", "border", "borderAccent", "borderMuted", "success", "error", "warning", "muted", "dim", "text", "thinkingText", "userMessageText", "customMessageText", "customMessageLabel", "toolTitle", "toolOutput", "mdHeading", "mdLink", "mdLinkUrl", "mdCode", "mdCodeBlock", "mdCodeBlockBorder", "mdQuote", "mdQuoteBorder", "mdHr", "mdListBullet", "toolDiffAdded", "toolDiffRemoved", "toolDiffContext", "syntaxComment", "syntaxKeyword", "syntaxFunction", "syntaxVariable", "syntaxString", "syntaxNumber", "syntaxType", "syntaxOperator", "syntaxPunctuation", "thinkingOff", "thinkingMinimal", "thinkingLow", "thinkingMedium", "thinkingHigh", "thinkingXhigh", "thinkingMax", "bashMode",
  ].map((key) => [key, "#ffffff"])) as Record<ThemeColor, string>,
  { selectedBg: "#111111", userMessageBg: "#111111", customMessageBg: "#111111", toolPendingBg: "#111111", toolSuccessBg: "#111111", toolErrorBg: "#111111" },
  "truecolor",
);

const stripAnsi = (value: string) => value.replace(/\x1b\[[0-9;]*m/g, "");

describe("tool card renderer", () => {
  it("renders pending cards as two full-width logical lines", () => {
    const state: ToolCardRenderState = {};
    const component = renderToolCard("read", { path: "very/long/file.ts" }, theme, {
      state,
      executionStarted: false,
      expanded: false,
      isPartial: true,
      isError: false,
    });
    const lines = component.render(42);
    expect(lines).toHaveLength(2);
    expect(lines.every((line) => stripAnsi(line).length === 42)).toBe(true);
    expect(stripAnsi(lines[0])).toContain("read");
    expect(stripAnsi(lines[1])).toContain("Reading...");
  });

  it("renders success, failure, and expanded stored text", () => {
    const result = { content: [{ type: "text" as const, text: "first\nsecond" }] };
    const success = renderToolCard("write", { path: "a", content: "α" }, theme, {
      state: {}, executionStarted: true, expanded: true, isPartial: false, isError: false,
    }, result);
    const successText = success.render(40).map(stripAnsi).join("\n");
    expect(successText).toContain("write");
    expect(successText).toContain("first");
    expect(successText).toContain("second");

    const failure = renderToolCard("read", { path: "a" }, theme, {
      state: {}, executionStarted: true, expanded: false, isPartial: false, isError: true,
    }, { content: [{ type: "text", text: "\npermission denied" }] });
    expect(failure.render(80).map(stripAnsi)[1]).toContain("permission denied");
  });

  it("uses a compact two-line edit card with minimalist counts and token estimates", () => {
    const component = renderToolCard("edit", { path: "src/a.ts" }, theme, {
      state: {}, executionStarted: true, expanded: false, isPartial: false, isError: false,
    }, { content: [{ type: "text", text: "updated" }], details: { diff: "+1 first\n+2 second\n-3 old" } });
    const lines = component.render(90).map(stripAnsi);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("edit  src/a.ts");
    expect(lines[1]).toContain("✓ +2  -1");
    expect(lines[1]).toMatch(/↑\d+ ↓\d+ \(\d+\)/);
  });

  it("preserves the tool name before truncating narrow targets without a rail", () => {
    const component = renderToolCard("bash", { command: "a very long command that must be clipped" }, theme, {
      state: {}, executionStarted: false, expanded: false, isPartial: true, isError: false,
    });
    const lines = component.render(12).map(stripAnsi);
    expect(lines.every((line) => line.length === 12)).toBe(true);
    expect(lines[0]).toContain("bash");
    expect(lines.join("\n")).not.toContain("▎");
    expect(lines[0]).not.toContain("very long command");
  });

  it("shows either the pending call card or the completed result card, never both", () => {
    const definition = createToolCardDefinitions("/tmp", SettingsManager.inMemory()).read;
    const context = {
      state: {}, executionStarted: true, expanded: false, isPartial: true, isError: false,
      args: { path: "a.txt" }, toolCallId: "read-1", invalidate: () => {},
      lastComponent: undefined, cwd: "/tmp", argsComplete: true, showImages: true,
    } as any;
    expect(definition.renderCall?.({ path: "a.txt" }, theme, context).render(40)).toHaveLength(2);
    expect(definition.renderResult?.({ content: [{ type: "text", text: "partial" }], details: undefined }, { expanded: false, isPartial: true }, theme, context).render(40)).toEqual([]);

    const finalContext = { ...context, isPartial: false };
    expect(definition.renderCall?.({ path: "a.txt" }, theme, finalContext).render(40)).toEqual([]);
    expect(definition.renderResult?.({ content: [{ type: "text", text: "done" }], details: undefined }, { expanded: false, isPartial: false }, theme, finalContext).render(80)).toHaveLength(2);
  });

  it("does not duplicate image data while showing image metadata", () => {
    const imageData = Buffer.from([1, 2, 3, 4]).toString("base64");
    const component = renderToolCard("read", { path: "image.png" }, theme, {
      state: {}, executionStarted: true, expanded: true, isPartial: false, isError: false,
    }, { content: [{ type: "text", text: "Read image file [image/png]" }, { type: "image", data: imageData, mimeType: "image/png" }] });
    const output = component.render(60).map(stripAnsi).join("\n");
    expect(output).toContain("image/png · 4 B");
    expect(output).not.toContain(imageData);
  });
});
