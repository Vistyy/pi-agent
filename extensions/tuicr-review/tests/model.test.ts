import assert from "node:assert/strict";
import { test } from "vitest";
import { annotationKey, annotationPayload, normalizeReview } from "../src/model.ts";

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
