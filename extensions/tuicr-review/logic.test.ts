import assert from "node:assert/strict";
import test from "node:test";
import {
  COORDINATOR_AUTHOR,
  STATE_ENTRY,
  annotationFingerprint,
  annotationPayload,
  commentFingerprint,
  discoverNewActive,
  normalizeRequest,
  restoreState,
  type PersistedState,
} from "./logic.ts";

test("constructs exact working-tree and revision launch targets", () => {
  assert.deepEqual(normalizeRequest("/repo", { target: { kind: "workingTree" } }).launchArgs, ["--working-tree", "--stdout"]);
  const revision = normalizeRequest("/repo", {
    cwd: "nested/..",
    target: { kind: "revisions", revset: " main..HEAD ", includeWorkingTree: true },
  });
  assert.equal(revision.cwd, "/repo");
  assert.deepEqual(revision.launchArgs, ["--revisions", "main..HEAD", "--working-tree", "--stdout"]);
  assert.throws(() => normalizeRequest("/repo", { target: { kind: "revisions", revset: "  " } }), /non-empty revset/);
});

test("normalizes review, file, line, and range annotations without requiring a type", () => {
  const request = normalizeRequest("/repo", {
    target: { kind: "workingTree" },
    annotations: [
      { kind: "review", content: " overview " },
      { kind: "file", file: " src/a.ts ", content: "file" },
      { kind: "line", file: "src/a.ts", line: 4, content: "line" },
      { kind: "range", file: "src/a.ts", startLine: 4, endLine: 7, side: "old", type: " concern ", content: "range" },
    ],
  });
  assert.deepEqual(request.annotations[0], { kind: "review", content: "overview" });
  assert.deepEqual(annotationPayload(request.annotations[2]!), {
    content: "line", username: COORDINATOR_AUTHOR, file: "src/a.ts", line: 4, side: "new",
  });
  assert.equal(annotationFingerprint(request.annotations[3]!), JSON.stringify({
    kind: "range", file: "src/a.ts", startLine: 4, endLine: 7, side: "old", content: "range", type: "concern",
  }));
  assert.throws(() => normalizeRequest("/repo", {
    target: { kind: "workingTree" },
    annotations: [{ kind: "range", file: "a", startLine: 3, endLine: 2, content: "x" }],
  }), /endLine/);
});

test("maps only Coordinator-authored persisted comments to exact annotation fingerprints", () => {
  const seeded = commentFingerprint({
    id: "c1", author: COORDINATOR_AUTHOR, path: "src/a.ts", start_line: 8, end_line: 8,
    side: "new", comment_type: "none", content: "Fix this",
  });
  assert.equal(seeded, annotationFingerprint({ kind: "line", file: "src/a.ts", line: 8, side: "new", content: "Fix this" }));
  assert.equal(commentFingerprint({ id: "m1", author: "Maintainer", content: "No", location: "review" }), undefined);
});

test("discovers only one exact newly active session", () => {
  const prior = [{ slug: "old", path: "/old.json", active: true }];
  assert.deepEqual(discoverNewActive(prior, [
    ...prior,
    { slug: "new", path: "/new.json", active: true },
  ]), { slug: "new", path: "/new.json", active: true });
  assert.throws(() => discoverNewActive(prior, prior), /found 0/);
  assert.throws(() => discoverNewActive([], [
    { slug: "a", path: "/a", active: true }, { slug: "b", path: "/b", active: true },
  ]), /found 2/);
});

test("restores only the latest state owned by the exact Pi session branch", () => {
  const state = (ownerSessionId: string, status: PersistedState["status"]): PersistedState => ({
    version: 1, ownerSessionId, status, targetKey: "target", cwd: "/repo",
    resources: { workspaceId: "w", tabId: "t", paneId: "p" }, tuicrSession: { slug: "s", path: "/s" },
    completionFile: "/exit", accepted: [], delivered: status !== "active",
  });
  const branch = [
    { type: "custom", customType: STATE_ENTRY, data: state("session-a", "active") },
    { type: "custom", customType: STATE_ENTRY, data: state("session-b", "active") },
    { type: "custom", customType: STATE_ENTRY, data: state("session-a", "completed") },
  ];
  assert.equal(restoreState(branch, "session-a")?.status, "completed");
  assert.equal(restoreState(branch, "session-b")?.status, "active");
  assert.equal(restoreState(branch, "fork")?.status, undefined);
});
