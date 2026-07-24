import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { isScratchMutationPath } from "../src/scratch-path.js";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), "subagent-scratch-path-"));
  temporaryDirectories.push(root);
  const scratchDir = path.join(root, "scratch");
  const outsideDir = path.join(root, "outside");
  mkdirSync(scratchDir);
  mkdirSync(outsideDir);
  return { root, scratchDir, outsideDir };
}

describe("scratch mutation path", () => {
  test("accepts existing and missing targets below scratch", () => {
    const { scratchDir } = fixture();
    const existing = path.join(scratchDir, "existing.txt");
    writeFileSync(existing, "content\n");

    expect(isScratchMutationPath(existing, scratchDir)).toBe(true);
    expect(
      isScratchMutationPath(
        path.join(scratchDir, "missing", "nested", "file.txt"),
        scratchDir,
      ),
    ).toBe(true);
  });

  test.each([
    ["relative path", "relative.txt"],
    ["scratch root", "SCRATCH_ROOT"],
    ["outside target", "OUTSIDE_TARGET"],
    ["traversal", "TRAVERSAL_TARGET"],
  ])("rejects %s", (_label, targetKind) => {
    const { scratchDir, outsideDir } = fixture();
    const target =
      targetKind === "SCRATCH_ROOT"
        ? scratchDir
        : targetKind === "OUTSIDE_TARGET"
          ? path.join(outsideDir, "file.txt")
          : targetKind === "TRAVERSAL_TARGET"
            ? path.join(scratchDir, "..", "outside", "file.txt")
            : targetKind;

    expect(isScratchMutationPath(target, scratchDir)).toBe(false);
  });

  test("rejects a target reached through a symlink", () => {
    const { scratchDir, outsideDir } = fixture();
    const link = path.join(scratchDir, "linked");
    symlinkSync(outsideDir, link, "dir");

    expect(
      isScratchMutationPath(path.join(link, "file.txt"), scratchDir),
    ).toBe(false);
  });
});
