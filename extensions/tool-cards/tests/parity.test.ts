import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createBashToolDefinition,
  createEditToolDefinition,
  createFindToolDefinition,
  createGrepToolDefinition,
  createLsToolDefinition,
  createReadToolDefinition,
  createWriteToolDefinition,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { createToolCardDefinitions } from "../src/tools.js";
import type { ToolName } from "../src/types.js";

const names: ToolName[] = ["read", "write", "edit", "bash", "grep", "find", "ls"];

function baseDefinitions(cwd: string, settings: SettingsManager) {
  return {
    read: createReadToolDefinition(cwd, { autoResizeImages: settings.getImageAutoResize() }),
    write: createWriteToolDefinition(cwd),
    edit: createEditToolDefinition(cwd),
    bash: createBashToolDefinition(cwd, { shellPath: settings.getShellPath(), commandPrefix: settings.getShellCommandPrefix() }),
    grep: createGrepToolDefinition(cwd),
    find: createFindToolDefinition(cwd),
    ls: createLsToolDefinition(cwd),
  };
}

function metadata(definition: { name: string; label: string; description: string; promptSnippet?: string; promptGuidelines?: string[]; parameters: unknown; constrainedSampling?: unknown; prepareArguments?: unknown; executionMode?: unknown }) {
  return JSON.stringify({
    name: definition.name,
    label: definition.label,
    description: definition.description,
    promptSnippet: definition.promptSnippet,
    promptGuidelines: definition.promptGuidelines,
    parameters: definition.parameters,
    constrainedSampling: definition.constrainedSampling,
    prepareArguments: Boolean(definition.prepareArguments),
    executionMode: definition.executionMode,
  });
}

async function fixture(cwd: string): Promise<void> {
  await mkdir(join(cwd, "nested"), { recursive: true });
  await writeFile(join(cwd, "read.txt"), "alpha\nneedle\n", "utf8");
  await writeFile(join(cwd, "edit.txt"), "old\nneedle\n", "utf8");
  await writeFile(join(cwd, "nested", "other.txt"), "needle\n", "utf8");
}

const args: Record<ToolName, Record<string, unknown>> = {
  read: { path: "read.txt" },
  write: { path: "write.txt", content: "α\nβ\n" },
  edit: { path: "edit.txt", edits: [{ oldText: "old\n", newText: "new\n" }] },
  bash: { command: "printf 'hello'" },
  grep: { pattern: "needle", path: ".", literal: true },
  find: { pattern: "*.txt", path: "." },
  ls: { path: "." },
};

describe("Tool Cards delegation", () => {
  it("preserves public definition metadata for all seven tools", () => {
    const settings = SettingsManager.inMemory({ images: { autoResize: true }, shellPath: "/bin/sh", shellCommandPrefix: "" });
    const cwd = "/tmp/tool-cards-metadata";
    const base = baseDefinitions(cwd, settings);
    const cards = createToolCardDefinitions(cwd, settings);
    for (const name of names) expect(metadata(cards[name])).toBe(metadata(base[name]));
  });

  it("preserves deterministic execution results for all seven tools", async () => {
    const root = await mkdtemp(join(tmpdir(), "pi-tool-cards-parity-test-"));
    const baselineCwd = join(root, "baseline");
    const cardCwd = join(root, "card");
    await mkdir(baselineCwd, { recursive: true });
    await mkdir(cardCwd, { recursive: true });
    await fixture(baselineCwd);
    await fixture(cardCwd);
    const baselineSettings = SettingsManager.inMemory({ images: { autoResize: true }, shellPath: "/bin/sh" });
    const cardSettings = SettingsManager.inMemory({ images: { autoResize: true }, shellPath: "/bin/sh" });
    const baseline = baseDefinitions(baselineCwd, baselineSettings);
    const cards = createToolCardDefinitions(cardCwd, cardSettings);
    const normalizeRoot = (value: unknown): unknown => {
      if (typeof value === "string") return value.replaceAll(baselineCwd, cardCwd);
      if (Array.isArray(value)) return value.map(normalizeRoot);
      if (typeof value === "object" && value !== null) {
        return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, normalizeRoot(child)]));
      }
      return value;
    };
    for (const name of names) {
      const expected = await baseline[name].execute(`${name}-baseline`, args[name] as never, undefined, undefined, undefined as never);
      const actual = await cards[name].execute(`${name}-card`, args[name] as never, undefined, undefined, undefined as never);
      if (name === "grep") {
        const lineCounts = (result: { content: Array<{ type: string; text?: string }> }) => {
          const text = result.content.find((part) => part.type === "text")?.text ?? "";
          const counts = new Map<string, number>();
          for (const line of text.split("\n")) counts.set(line, (counts.get(line) ?? 0) + 1);
          return [...counts.entries()].sort(([left], [right]) => left.localeCompare(right));
        };
        expect(lineCounts(actual)).toEqual(lineCounts(normalizeRoot(expected) as typeof expected));
        expect(actual.details).toEqual(expected.details);
      } else {
        expect(actual).toEqual(normalizeRoot(expected));
      }
    }
  });

  it("reloads saved settings before a Bash execution", async () => {
    const root = await mkdtemp(join(tmpdir(), "pi-tool-cards-settings-test-"));
    const cwd = join(root, "project");
    const agentDir = join(root, "agent");
    await mkdir(join(cwd, ".pi"), { recursive: true });
    await mkdir(agentDir, { recursive: true });
    await writeFile(join(agentDir, "settings.json"), JSON.stringify({ shellPath: "/bin/sh", shellCommandPrefix: "printf 'old:'; " }), "utf8");
    await writeFile(join(cwd, ".pi", "settings.json"), JSON.stringify({ shellCommandPrefix: "printf 'new:'; " }), "utf8");
    const settings = SettingsManager.create(cwd, agentDir, { projectTrusted: true });
    const cards = createToolCardDefinitions(cwd, settings);
    const result = await cards.bash.execute("bash-settings", { command: "printf 'ok'" }, undefined, undefined, undefined as never);
    expect(result.content).toEqual([{ type: "text", text: "new:ok" }]);
  });
});
