import { access } from "node:fs/promises";
import { dirname } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { ensureHerdrPlugin, launchHerdrPopup, type CommandRunner } from "../src/herdr.js";

function result(stdout = "", code = 0, stderr = "") {
  return { stdout, stderr, code };
}

const snapshot = {
  cwd: "/tmp/project",
  results: [],
  theme: { foreground: {} as any, background: {} as any },
};

describe("Herdr popup launcher", () => {
  it("reuses an enabled plugin link to the current root", async () => {
    const run = vi.fn(async () => result(JSON.stringify({
      result: { plugins: [{ plugin_id: "pi-tool-lens", plugin_root: "/opt/tool-lens", enabled: true }] },
    }))) as unknown as CommandRunner;

    await ensureHerdrPlugin(run, "/opt/tool-lens", "/tmp/project");

    expect(run).toHaveBeenCalledOnce();
  });

  it("replaces a stale plugin link", async () => {
    const calls: string[][] = [];
    const run: CommandRunner = async (_command, args) => {
      calls.push(args);
      if (args[1] === "list") {
        return result(JSON.stringify({
          result: { plugins: [{ plugin_id: "pi-tool-lens", plugin_root: "/old/tool-lens", enabled: true }] },
        }));
      }
      return result();
    };

    await ensureHerdrPlugin(run, "/new/tool-lens", "/tmp/project");

    expect(calls.map((args) => args.slice(0, 3))).toEqual([
      ["plugin", "list", "--plugin"],
      ["plugin", "unlink", "pi-tool-lens"],
      ["plugin", "link", "/new/tool-lens"],
    ]);
  });

  it("removes its private snapshot when popup launch fails", async () => {
    let snapshotPath = "";
    const run: CommandRunner = async (_command, args) => {
      if (args[1] === "list") return result(JSON.stringify({ result: { plugins: [] } }));
      if (args[1] === "pane") {
        snapshotPath = args[args.indexOf("--env") + 1]!.slice("TOOL_LENS_SNAPSHOT=".length);
        return result("", 1, "popup unavailable");
      }
      return result();
    };

    await expect(launchHerdrPopup(run, "/opt/tool-lens", snapshot)).rejects.toThrow("popup unavailable");
    await expect(access(snapshotPath)).rejects.toThrow();
    await expect(access(dirname(snapshotPath))).rejects.toThrow();
  });
});
