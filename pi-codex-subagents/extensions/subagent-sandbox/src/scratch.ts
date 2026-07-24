import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

export const DEFAULT_SCRATCH_ROOT = path.join(
  tmpdir(),
  "pi-codex-subagent-sandbox",
);

const UNOWNED_RUN_GRACE_MS = 24 * 60 * 60 * 1000;

type Owner = {
  pid: number;
  createdAt: string;
  processStartTime?: string;
};

function processIsAlive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

function linuxProcessStartTime(pid: number) {
  if (process.platform !== "linux") return undefined;
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
    const commandEnd = stat.lastIndexOf(")");
    if (commandEnd < 0) return undefined;
    return stat.slice(commandEnd + 1).trim().split(/\s+/)[19];
  } catch {
    return undefined;
  }
}

function readOwner(runDirectory: string): Owner | undefined {
  try {
    const value = JSON.parse(
      readFileSync(path.join(runDirectory, "owner.json"), "utf8"),
    ) as Partial<Owner>;
    if (!Number.isInteger(value.pid) || (value.pid ?? 0) <= 0) return undefined;
    if (
      typeof value.createdAt !== "string" ||
      Number.isNaN(Date.parse(value.createdAt))
    ) {
      return undefined;
    }
    if (
      value.processStartTime !== undefined &&
      typeof value.processStartTime !== "string"
    ) {
      return undefined;
    }
    return value as Owner;
  } catch {
    return undefined;
  }
}

function ownerProcessIsCurrent(owner: Owner) {
  if (!processIsAlive(owner.pid)) return false;
  if (!owner.processStartTime) return true;
  const currentStartTime = linuxProcessStartTime(owner.pid);
  return currentStartTime === undefined || currentStartTime === owner.processStartTime;
}

function oldEnoughToReclaim(runDirectory: string) {
  try {
    return Date.now() - statSync(runDirectory).mtimeMs >= UNOWNED_RUN_GRACE_MS;
  } catch {
    return false;
  }
}

function removeStaleRuns(root: string) {
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith("run-")) continue;
    const runDirectory = path.join(root, entry.name);
    const owner = readOwner(runDirectory);
    if (
      (owner && !ownerProcessIsCurrent(owner)) ||
      (!owner && oldEnoughToReclaim(runDirectory))
    ) {
      rmSync(runDirectory, { recursive: true, force: true });
    }
  }
}

export interface ScratchRun {
  scratchDir: string;
  cleanup(): void;
}

export function createScratchRun(root = DEFAULT_SCRATCH_ROOT): ScratchRun {
  mkdirSync(root, { recursive: true, mode: 0o700 });
  removeStaleRuns(root);

  const runDirectory = mkdtempSync(path.join(root, `run-${process.pid}-`));
  const scratchDir = path.join(runDirectory, "scratch");
  writeFileSync(
    path.join(runDirectory, "owner.json"),
    `${JSON.stringify({
      pid: process.pid,
      createdAt: new Date().toISOString(),
      processStartTime: linuxProcessStartTime(process.pid),
    })}\n`,
    { encoding: "utf8", mode: 0o600 },
  );
  mkdirSync(scratchDir, { mode: 0o700 });

  let active = true;
  return {
    scratchDir,
    cleanup() {
      if (!active) return;
      active = false;
      if (existsSync(runDirectory)) {
        rmSync(runDirectory, { recursive: true, force: true });
      }
    },
  };
}
