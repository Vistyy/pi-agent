import { describe, expect, it } from "vitest";
import extension from "../src/index.js";
import { findToolConflicts } from "../src/tools.js";

describe("Tool Cards startup conflict detection", () => {
  it("reports extension-owned supported names and ignores built-ins", () => {
    expect(findToolConflicts({
      getAllTools: () => [
        { name: "read", sourceInfo: { source: "builtin" } },
        { name: "bash", sourceInfo: { source: "other-extension" } },
        { name: "custom", sourceInfo: { source: "other-extension" } },
      ],
    })).toEqual(["bash (other-extension)"]);
  });

  it("registers all seven replacements at session startup", async () => {
    let handler: ((event: unknown, ctx: unknown) => Promise<void>) | undefined;
    const registered: string[] = [];
    const pi = {
      on: (_event: string, callback: (event: unknown, ctx: unknown) => Promise<void>) => { handler = callback; },
      getAllTools: () => ["read", "bash", "edit", "write"].map((name) => ({ name, sourceInfo: { source: "builtin" } })),
      registerTool: (tool: { name: string }) => { registered.push(tool.name); },
    } as never;
    extension(pi);
    await handler?.({}, { cwd: "/tmp", isProjectTrusted: () => false });
    expect(registered).toEqual(["read", "write", "edit", "bash", "grep", "find", "ls"]);
  });

  it("fails before registration when another extension owns a supported name", async () => {
    let handler: ((event: unknown, ctx: unknown) => Promise<void>) | undefined;
    const registered: string[] = [];
    const pi = {
      on: (_event: string, callback: (event: unknown, ctx: unknown) => Promise<void>) => { handler = callback; },
      getAllTools: () => [{ name: "read", sourceInfo: { source: "other-extension" } }],
      registerTool: (tool: { name: string }) => { registered.push(tool.name); },
    } as never;
    extension(pi);
    await expect(handler?.({}, { cwd: "/tmp", isProjectTrusted: () => false })).rejects.toThrow("startup conflict");
    expect(registered).toEqual([]);
  });
});
