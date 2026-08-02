import { readFile, rm } from "node:fs/promises";
import { dirname } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import toolLensExtension from "../src/index.js";

const theme = {
  name: "test",
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
        content: [{ type: "text", text: "snapshot" }],
        isError: false,
      },
    },
  ] as any;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("tool lens extension", () => {
  it("registers only /lens and reports the non-interactive mode requirement", async () => {
    const commands = new Map<string, any>();
    const pi = {
      registerCommand: vi.fn((name: string, command: any) => commands.set(name, command)),
      exec: vi.fn(),
    } as unknown as ExtensionAPI;
    toolLensExtension(pi);
    expect([...commands.keys()]).toEqual(["lens"]);

    const notify = vi.fn();
    await commands.get("lens").handler("", {
      mode: "print",
      hasUI: false,
      ui: { notify },
      sessionManager: { getBranch: () => { throw new Error("must not project without UI"); } },
    });
    expect(notify).toHaveBeenCalledWith("Tool Lens requires interactive mode.", "info");
    expect(pi.exec).not.toHaveBeenCalled();
  });

  it("reports when Pi is not running inside Herdr", async () => {
    vi.stubEnv("HERDR_ENV", "");
    vi.stubEnv("HERDR_SOCKET_PATH", "");
    const commands = new Map<string, any>();
    const pi = {
      registerCommand: vi.fn((name: string, command: any) => commands.set(name, command)),
      exec: vi.fn(),
    } as unknown as ExtensionAPI;
    toolLensExtension(pi);
    const notify = vi.fn();

    await commands.get("lens").handler("", {
      mode: "tui",
      hasUI: true,
      ui: { notify },
      sessionManager: { getBranch: () => branch() },
    });

    expect(notify).toHaveBeenCalledWith("Tool Lens requires Pi to run inside Herdr 0.7.4 or newer.", "error");
    expect(pi.exec).not.toHaveBeenCalled();
  });

  it("takes a static snapshot and launches an 85% Herdr popup during an active turn", async () => {
    vi.stubEnv("HERDR_ENV", "1");
    vi.stubEnv("HERDR_SOCKET_PATH", "/tmp/herdr.sock");
    const commands = new Map<string, any>();
    const calls: string[][] = [];
    let snapshotPath = "";
    const exec = vi.fn(async (_command: string, args: string[]) => {
      calls.push(args);
      if (args[0] === "plugin" && args[1] === "list") {
        return { stdout: JSON.stringify({ result: { plugins: [] } }), stderr: "", code: 0 };
      }
      if (args[0] === "plugin" && args[1] === "pane") {
        snapshotPath = args[args.indexOf("--env") + 1]!.slice("TOOL_LENS_SNAPSHOT=".length);
      }
      return { stdout: "", stderr: "", code: 0 };
    });
    const pi = {
      registerCommand: vi.fn((name: string, command: any) => commands.set(name, command)),
      exec,
    } as unknown as ExtensionAPI;
    toolLensExtension(pi);
    const entries = branch();
    const custom = vi.fn();

    await commands.get("lens").handler("", {
      mode: "tui",
      hasUI: true,
      isIdle: () => false,
      hasPendingMessages: () => true,
      cwd: "/tmp/project",
      ui: { notify: vi.fn(), custom, theme },
      sessionManager: { getBranch: () => entries },
    });

    expect(custom).not.toHaveBeenCalled();
    expect(calls.map((args) => args.slice(0, 3))).toEqual([
      ["plugin", "list", "--plugin"],
      ["plugin", "link", expect.any(String)],
      ["plugin", "pane", "open"],
    ]);
    const openArgs = calls[2]!;
    expect(openArgs).toEqual(expect.arrayContaining(["--placement", "popup", "--width", "85%", "--height", "85%", "--focus"]));

    entries[1].message.content[0].text = "changed-after-open";
    const snapshot = JSON.parse(await readFile(snapshotPath, "utf8"));
    expect(snapshot.cwd).toBe("/tmp/project");
    expect(snapshot.results[0].content[0].text).toBe("snapshot");
    expect(snapshot.theme.name).toBe("test");
    await rm(dirname(snapshotPath), { recursive: true, force: true });
  });
});
