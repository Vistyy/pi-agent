import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, loadConfig } from "../src/config.js";

const tempDirs: string[] = [];

function tempDir(name: string): string {
  const dir = join(tmpdir(), `pi-fork-${name}-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  tempDirs.push(dir);
  return dir;
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, JSON.stringify(value, null, 2));
}

afterEach(() => {
  delete process.env.PI_CODING_AGENT_DIR;
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("loadConfig", () => {
  it("defaults to no child extensions", () => {
    const cwd = tempDir("cwd");
    const agentDir = tempDir("agent");
    process.env.PI_CODING_AGENT_DIR = agentDir;

    expect(loadConfig(cwd).extensions).toEqual([]);
    expect(DEFAULT_CONFIG.extensions).toEqual([]);
  });

  it("preserves explicit null for normal Pi extension discovery", () => {
    const cwd = tempDir("cwd");
    const agentDir = tempDir("agent");
    process.env.PI_CODING_AGENT_DIR = agentDir;
    writeJson(join(agentDir, "settings.json"), { "pi-fork": { extensions: null } });

    expect(loadConfig(cwd).extensions).toBeNull();
  });

  it("resolves child extension paths relative to the settings file", () => {
    const cwd = tempDir("cwd");
    const agentDir = tempDir("agent");
    const projectSettingsDir = join(cwd, ".pi");
    mkdirSync(projectSettingsDir, { recursive: true });
    process.env.PI_CODING_AGENT_DIR = agentDir;
    writeJson(join(projectSettingsDir, "settings.json"), {
      "pi-fork": { extensions: ["./child-extension", "npm:pkg"] },
    });

    expect(loadConfig(cwd).extensions).toEqual([
      join(projectSettingsDir, "child-extension"),
      "npm:pkg",
    ]);
  });

  it("merges environment with project values overriding global values", () => {
    const cwd = tempDir("cwd");
    const agentDir = tempDir("agent");
    const projectSettingsDir = join(cwd, ".pi");
    mkdirSync(projectSettingsDir, { recursive: true });
    process.env.PI_CODING_AGENT_DIR = agentDir;
    writeJson(join(agentDir, "settings.json"), {
      "pi-fork": { environment: { A: "global", B: "global" } },
    });
    writeJson(join(projectSettingsDir, "settings.json"), {
      "pi-fork": { environment: { B: "project", C: "project" } },
    });

    expect(loadConfig(cwd).environment).toEqual({ A: "global", B: "project", C: "project" });
  });
});
