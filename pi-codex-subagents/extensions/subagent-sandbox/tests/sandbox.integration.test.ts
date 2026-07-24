import { execSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { buildSandboxedCommand } from "../src/sandbox.js";

const hasBwrap = (() => {
  try {
    execSync("command -v bwrap", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

const temporaryDirectories: string[] = [];

function temporaryDirectory(prefix: string) {
  const directory = mkdtempSync(path.join(tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

function runSandboxed(
  command: string,
  options: {
    cwd: string;
    homeDir: string;
    scratchDir: string;
    persistentWritableDirectories?: string[];
    xdgCacheHome?: string;
  },
) {
  return execSync(
    buildSandboxedCommand(command, {
      homeDir: options.homeDir,
      scratchDir: options.scratchDir,
      persistentWritableDirectories: options.persistentWritableDirectories,
      xdgCacheHome: options.xdgCacheHome,
    }),
    {
      cwd: options.cwd,
      encoding: "utf8",
      env: process.env,
    },
  ).trim();
}

describe.skipIf(!hasBwrap)("subagent sandbox", () => {
  test("a configured home cache persists while other home writes remain disposable", () => {
    const cwd = temporaryDirectory("subagent-sandbox-workspace-");
    const homeDir = mkdtempSync(path.join(homedir(), ".subagent-sandbox-home-"));
    temporaryDirectories.push(homeDir);
    const cacheHome = path.join(homeDir, "custom-cache");
    const cacheDir = path.join(cacheHome, "pi", "library-orientation");
    mkdirSync(cacheDir, { recursive: true });
    const runDirectory = temporaryDirectory("subagent-sandbox-run-");
    const scratchDir = path.join(runDirectory, "scratch");
    mkdirSync(scratchDir);

    try {
      runSandboxed(
        "printf cache > $XDG_CACHE_HOME/pi/library-orientation/marker && printf temporary > $HOME/home-marker",
        {
          cwd,
          homeDir,
          scratchDir,
          persistentWritableDirectories: [cacheDir],
          xdgCacheHome: cacheHome,
        },
      );

      expect(readFileSync(path.join(cacheDir, "marker"), "utf8")).toBe("cache");
      expect(existsSync(path.join(homeDir, "home-marker"))).toBe(false);
    } finally {
      for (const directory of temporaryDirectories.splice(0)) {
        rmSync(directory, { recursive: true, force: true });
      }
    }
  });

  test("workspace and home writes are disposable while scratch persists", () => {
    const cwd = temporaryDirectory("subagent-sandbox-workspace-");
    const homeDir = mkdtempSync(path.join(homedir(), ".subagent-sandbox-home-"));
    temporaryDirectories.push(homeDir);
    const runDirectory = temporaryDirectory("subagent-sandbox-run-");
    const scratchDir = path.join(runDirectory, "scratch");
    mkdirSync(scratchDir);

    try {
      const firstResult = runSandboxed(
        [
          "printf workspace > workspace-marker",
          "printf home > $HOME/home-marker",
          "printf scratch > $TMPDIR/scratch-marker",
          "printf '%s|%s|%s' \"$(cat workspace-marker)\" \"$(cat $HOME/home-marker)\" \"$(cat $TMPDIR/scratch-marker)\"",
        ].join(" && "),
        { cwd, homeDir, scratchDir },
      );
      const secondResult = runSandboxed("cat $TMPDIR/scratch-marker", {
        cwd,
        homeDir,
        scratchDir,
      });

      expect({
        firstResult,
        secondResult,
        workspacePersisted: existsSync(path.join(cwd, "workspace-marker")),
        homePersisted: existsSync(path.join(homeDir, "home-marker")),
        scratch: readFileSync(path.join(scratchDir, "scratch-marker"), "utf8"),
      }).toEqual({
        firstResult: "workspace|home|scratch",
        secondResult: "scratch",
        workspacePersisted: false,
        homePersisted: false,
        scratch: "scratch",
      });
    } finally {
      for (const directory of temporaryDirectories.splice(0)) {
        rmSync(directory, { recursive: true, force: true });
      }
    }
  });
});
