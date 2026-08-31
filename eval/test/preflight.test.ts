import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { verifyPreflight } from "../src/trial.js";

async function fixture(): Promise<{ root: string; cleanup: () => Promise<void> }> {
  const root = await mkdtemp(path.join(os.tmpdir(), "pi-eval-preflight-"));
  await mkdir(path.join(root, "src"));
  await writeFile(path.join(root, "src", "owner.ts"), "export class Owner {}\n", "utf8");
  return { root, cleanup: () => rm(root, { recursive: true, force: true }) };
}

test("generic preflight checks fixture file contents", async () => {
  const subject = await fixture();
  try {
    await verifyPreflight(subject.root, {
      "owner-present": {
        checker: "files-contain",
        files: [{ path: "src/owner.ts", contains: ["class Owner"] }],
      },
    });
    await assert.rejects(
      verifyPreflight(subject.root, {
        "different-owner-present": {
          checker: "files-contain",
          files: [{ path: "src/owner.ts", contains: ["class OtherOwner"] }],
        },
      }),
      /does not contain "class OtherOwner"/u,
    );
  } finally {
    await subject.cleanup();
  }
});

test("preflight cannot read outside its fixture", async () => {
  const subject = await fixture();
  try {
    await assert.rejects(
      verifyPreflight(subject.root, {
        "outside-file": {
          checker: "files-contain",
          files: [{ path: "../outside", contains: ["anything"] }],
        },
      }),
      /outside the fixture/u,
    );
  } finally {
    await subject.cleanup();
  }
});
