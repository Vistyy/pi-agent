import { describe, expect, it, vi } from "vitest";
import { visibleWidth } from "@earendil-works/pi-tui";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import toolLensExtension from "../src/index.js";

const theme = {
  name: "test",
  bg: (_name: string, text: string) => text,
  fg: (_name: string, text: string) => text,
  bold: (text: string) => text,
  getFgAnsi: (_name: string) => "\u001b[37m",
  getBgAnsi: (_name: string) => "\u001b[40m",
} as any;

function branch() {
  return [
    {
      type: "message",
      id: "assistant",
      parentId: null,
      timestamp: "2026-01-01T00:00:00Z",
      message: {
        role: "assistant",
        content: [{ type: "toolCall", id: "call", name: "extension_tool", arguments: { action: "run" } }],
      },
    },
    {
      type: "message",
      id: "result",
      parentId: "assistant",
      timestamp: "2026-01-01T00:00:01Z",
      message: {
        role: "toolResult",
        toolCallId: "call",
        toolName: "extension_tool",
        content: [{ type: "text", text: "overlay result" }],
        isError: false,
      },
    },
  ] as any;
}

function registeredCommand() {
  const commands = new Map<string, any>();
  const pi = {
    registerCommand: vi.fn((name: string, command: any) => commands.set(name, command)),
  } as unknown as ExtensionAPI;
  toolLensExtension(pi);
  return { pi, command: commands.get("lens") };
}

describe("tool lens extension", () => {
  it("registers only /lens and reports the non-interactive mode requirement", async () => {
    const { pi, command } = registeredCommand();
    expect((pi.registerCommand as any).mock.calls.map((call: any[]) => call[0])).toEqual(["lens"]);

    const notify = vi.fn();
    await command.handler("", {
      mode: "print",
      ui: { notify },
      sessionManager: { getBranch: () => { throw new Error("must not project without TUI"); } },
    });

    expect(notify).toHaveBeenCalledWith("Tool Lens requires interactive mode.", "info");
  });

  it("opens a terminal-sized Pi overlay during an active turn without clipping its rows", async () => {
    const { command } = registeredCommand();
    const requestRender = vi.fn();
    const done = vi.fn();
    let rendered: string[] = [];
    let overlayOptions: any;
    const custom = vi.fn(async (factory: any, options: any) => {
      overlayOptions = options;
      const component = factory(
        { terminal: { rows: 24, columns: 100 }, requestRender },
        theme,
        {},
        done,
      );
      rendered = component.render(96);
      component.handleInput("\u001b");
    });

    await command.handler("", {
      mode: "tui",
      cwd: "/tmp/project",
      isIdle: () => false,
      hasPendingMessages: () => true,
      ui: { custom, notify: vi.fn() },
      sessionManager: { getBranch: () => branch() },
    });

    expect(overlayOptions).toMatchObject({
      overlay: true,
      overlayOptions: { anchor: "center", width: "96%", maxHeight: "94%", margin: 1 },
    });
    expect(rendered).toHaveLength(22);
    expect(rendered.join("\n")).toContain("overlay result");
    expect(rendered.every((line) => visibleWidth(line) === 96)).toBe(true);
    expect(done).toHaveBeenCalledOnce();
  });
});
