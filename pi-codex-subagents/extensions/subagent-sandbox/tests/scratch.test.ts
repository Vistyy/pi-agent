import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { createScratchRun } from "../src/scratch.js";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function scratchRoot() {
  const root = mkdtempSync(path.join(tmpdir(), "subagent-scratch-lifecycle-"));
  temporaryDirectories.push(root);
  return root;
}

describe("scratch lifecycle", () => {
  test("keeps scratch owned by a live process", () => {
    const root = scratchRoot();
    const first = createScratchRun(root);
    const second = createScratchRun(root);

    expect(existsSync(first.scratchDir)).toBe(true);
    expect(existsSync(second.scratchDir)).toBe(true);

    first.cleanup();
    second.cleanup();
  });

  test("reclaims an old run with malformed ownership metadata", () => {
    const root = scratchRoot();
    const staleRun = path.join(root, "run-malformed");
    mkdirSync(staleRun);
    writeFileSync(path.join(staleRun, "owner.json"), "not json\n");
    const oldTime = new Date(Date.now() - 25 * 60 * 60 * 1000);
    utimesSync(staleRun, oldTime, oldTime);

    const current = createScratchRun(root);

    expect(existsSync(staleRun)).toBe(false);
    current.cleanup();
  });
});
