import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const SCRIPT = fileURLToPath(new URL("./papercuts.mjs", import.meta.url));

function withHome(run) {
  const home = mkdtempSync(join(tmpdir(), "papercuts-test-"));
  try {
    return run(home);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

function dataPath(home, name) {
  return join(home, ".pi", "agent", "papercuts", name);
}

function writeJsonLines(path, records) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, records.map((record) => JSON.stringify(record)).join("\n") + "\n");
}

function invoke(home, ...args) {
  const result = spawnSync(process.execPath, [SCRIPT, ...args], {
    encoding: "utf8",
    env: { ...process.env, HOME: home },
  });
  return {
    status: result.status,
    stderr: result.stderr,
    stdout: JSON.parse(result.stdout),
  };
}

const observation = (id, timestamp) => ({
  id,
  timestamp,
  sessionId: `session-${id}`,
  project: "/project",
  text: `Friction ${id}`,
});

test("prepare returns the oldest bounded pending entries", () =>
  withHome((home) => {
    writeJsonLines(dataPath(home, "inbox.jsonl"), [
      observation("latest", "2026-08-04T12:00:00.000Z"),
      observation("oldest", "2026-08-02T12:00:00.000Z"),
      observation("resolved", "2026-08-03T12:00:00.000Z"),
    ]);
    writeJsonLines(dataPath(home, "archive.jsonl"), [
      {
        entryId: "resolved",
        disposition: "dismissed",
        reviewedAt: "2026-08-04T13:00:00.000Z",
      },
    ]);

    const result = invoke(home, "prepare", "--limit", "1");

    assert.equal(result.status, 0);
    assert.equal(result.stderr, "");
    assert.equal(result.stdout.pendingTotal, 2);
    assert.equal(result.stdout.returned, 1);
    assert.equal(result.stdout.hasMore, true);
    assert.deepEqual(result.stdout.entries.map((entry) => entry.id), ["oldest"]);
  }));

test("resolve records a known disposition once and rejects conflicting changes", () =>
  withHome((home) => {
    writeJsonLines(dataPath(home, "inbox.jsonl"), [
      observation("target", "2026-08-04T12:00:00.000Z"),
    ]);

    const resolved = invoke(
      home,
      "resolve",
      "--disposition",
      "follow-up",
      "--id",
      "target",
      "--note",
      "Needs work",
    );
    assert.equal(resolved.status, 0);
    assert.equal(resolved.stdout.resolved, 1);
    assert.equal(resolved.stdout.noOp, 0);

    const archivePath = dataPath(home, "archive.jsonl");
    const records = readFileSync(archivePath, "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    assert.equal(records.length, 1);
    assert.deepEqual(
      {
        entryId: records[0].entryId,
        disposition: records[0].disposition,
        note: records[0].note,
      },
      { entryId: "target", disposition: "follow-up", note: "Needs work" },
    );

    const repeated = invoke(home, "resolve", "--disposition", "follow-up", "--id", "target");
    assert.equal(repeated.status, 0);
    assert.equal(repeated.stdout.resolved, 0);
    assert.equal(repeated.stdout.noOp, 1);
    assert.equal(readFileSync(archivePath, "utf8").trim().split("\n").length, 1);

    const conflicting = invoke(home, "resolve", "--disposition", "dismissed", "--id", "target");
    assert.equal(conflicting.status, 1);
    assert.match(conflicting.stdout.error, /different disposition/);
    assert.equal(readFileSync(archivePath, "utf8").trim().split("\n").length, 1);
  }));

test("prepare rejects malformed inbox data", () =>
  withHome((home) => {
    const inboxPath = dataPath(home, "inbox.jsonl");
    mkdirSync(dirname(inboxPath), { recursive: true });
    writeFileSync(inboxPath, "{invalid json}\n");

    const result = invoke(home, "prepare");

    assert.equal(result.status, 1);
    assert.match(result.stdout.error, /contains invalid JSON/);
  }));
