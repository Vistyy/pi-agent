import assert from "node:assert/strict";
import { test } from "vitest";
import { annotationKey, annotationPayload, commentAnnotationKey, normalizeReview, restoreReview, STATE_ENTRY } from "../src/model.ts";

test("constructs working-tree and revision-range targets", () => {
  assert.deepEqual(normalizeReview("/repo", { target: { kind: "workingTree" } }).launchArgs,
    ["--working-tree", "--stdout", "--no-update-check"]);
  const revisions = normalizeReview("/repo", {
    cwd: "nested/..",
    target: { kind: "revisions", revset: " main..HEAD ", includeWorkingTree: true },
  });
  assert.equal(revisions.cwd, "/repo");
  assert.deepEqual(revisions.launchArgs,
    ["--revisions", "main..HEAD", "--working-tree", "--stdout", "--no-update-check"]);
  assert.throws(() => normalizeReview("/repo", { target: { kind: "revisions", revset: " " } }), /non-empty revset/);
});

test("supports review, file, old/new line, and old/new range annotations", () => {
  const annotations = normalizeReview("/repo", {
    target: { kind: "workingTree" },
    annotations: [
      { kind: "review", content: " overview " },
      { kind: "file", file: " src/a.ts ", content: "file" },
      { kind: "line", file: "src/a.ts", line: 4, side: "old", content: "line" },
      { kind: "range", file: "src/a.ts", startLine: 5, endLine: 8, side: "new", content: "range" },
    ],
  }).annotations;
  assert.deepEqual(annotations.map(annotationPayload), [
    { username: "Pi", content: "overview" },
    { username: "Pi", file: "src/a.ts", content: "file" },
    { username: "Pi", file: "src/a.ts", line: 4, side: "old", content: "line" },
    { username: "Pi", file: "src/a.ts", start_line: 5, end_line: 8, side: "new", content: "range" },
  ]);
  assert.notEqual(annotationKey(annotations[2]!), annotationKey({ ...annotations[2]!, content: "changed" }));
  assert.throws(() => normalizeReview("/repo", {
    target: { kind: "workingTree" },
    annotations: [{ kind: "range", file: "a", startLine: 3, endLine: 2, content: "x" }],
  }), /endLine/);
});

test("reconstructs normalized exact keys only for Pi-authored comments", () => {
  assert.equal(commentAnnotationKey({
    id: "r", author: "Pi", content: " overview ", path: null, start_line: null, end_line: null, side: null,
  }), annotationKey({ kind: "review", content: "overview" }));
  assert.equal(commentAnnotationKey({
    id: "f", author: "Pi", content: "file", path: " src/a.ts ", start_line: null, end_line: null, side: null,
  }), annotationKey({ kind: "file", file: "src/a.ts", content: "file" }));
  assert.equal(commentAnnotationKey({
    id: "l", author: "Pi", content: "line", path: "a", start_line: 4, end_line: null, side: "new",
  }), annotationKey({ kind: "line", file: "a", line: 4, side: "new", content: "line" }));
  assert.equal(commentAnnotationKey({
    id: "g", author: "Pi", content: "range", path: "a", start_line: 2, end_line: 5, side: "old",
  }), annotationKey({ kind: "range", file: "a", startLine: 2, endLine: 5, side: "old", content: "range" }));
  assert.equal(commentAnnotationKey({ id: "omitted", author: "Pi", content: "line", path: "a", start_line: 4 }),
    annotationKey({ kind: "line", file: "a", line: 4, side: "new", content: "line" }));
  assert.equal(commentAnnotationKey({ id: "m", author: "Maintainer", content: "line", path: "a", start_line: 4 }), undefined);
});

test("rejects restored ownership with a partial or non-private cleanup path", () => {
  const entry = (review: Record<string, unknown>) => [{
    type: "custom", customType: STATE_ENTRY,
    data: { state: "active", ownerSessionId: "owner", review },
  }];
  const otherwiseComplete = {
    targetKey: "target", cwd: "/repo", tabId: "tab", paneId: "pane", sessionId: "session",
    dataHome: "/tmp/pi-tuicr-review-owner-private", completionFile: "/tmp/pi-tuicr-review-owner-private/exit", accepted: {},
  };
  assert.equal(restoreReview(entry({ ...otherwiseComplete, completionFile: "/tmp/victim" }), "owner"), undefined);
  assert.equal(restoreReview(entry({ ...otherwiseComplete, dataHome: "/var/tmp/pi-tuicr-review-owner-private" }), "owner"), undefined);
});
