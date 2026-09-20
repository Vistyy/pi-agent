import assert from "node:assert/strict";
import { test } from "vitest";
import {
  annotationKey, annotationPayload, commentAnnotationKey, exactReview, normalizeRequest, restoreReview, STATE_ENTRY,
} from "../src/model.ts";

const base = "a".repeat(40);
const head = "b".repeat(40);

test("constructs only an exact committed comparison", () => {
  const request = normalizeRequest("/repo", { cwd: "nested/..", base: " main ", head: " HEAD ", replaceExisting: false });
  assert.deepEqual(request, { cwd: "/repo", base: "main", head: "HEAD", replaceExisting: false, annotations: [] });
  const exact = exactReview(request, { base, head });
  assert.deepEqual(exact.launchArgs, ["--revisions", `${base}..${head}`, "--stdout", "--no-update-check"]);
  assert.equal(exact.targetKey, JSON.stringify({ cwd: "/repo", base, head }));
  assert.throws(() => normalizeRequest("/repo", { base: " ", head: "HEAD", replaceExisting: false }), /base and head/);
});

test("supports review, file, old/new line, and old/new range annotations", () => {
  const annotations = normalizeRequest("/repo", {
    base: "main", head: "HEAD", replaceExisting: false,
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
});

test("reconstructs normalized exact keys only for Pi-authored comments", () => {
  assert.equal(commentAnnotationKey({ id: "r", author: "Pi", content: " overview ", path: null }), annotationKey({ kind: "review", content: "overview" }));
  assert.equal(commentAnnotationKey({ id: "f", author: "Pi", content: "file", path: " src/a.ts ", start_line: null, end_line: null }), annotationKey({ kind: "file", file: "src/a.ts", content: "file" }));
  assert.equal(commentAnnotationKey({ id: "l", author: "Pi", content: "line", path: "a", start_line: 4, end_line: null, side: "new" }), annotationKey({ kind: "line", file: "a", line: 4, side: "new", content: "line" }));
  assert.equal(commentAnnotationKey({ id: "m", author: "Maintainer", content: "line", path: "a", start_line: 4 }), undefined);
});

test("restores only exact comparisons with private owned cleanup paths", () => {
  const entry = (review: Record<string, unknown>) => [{ type: "custom", customType: STATE_ENTRY, data: { state: "active", ownerSessionId: "owner", review } }];
  const complete = {
    targetKey: "target", cwd: "/repo", base, head, tabId: "tab", paneId: "pane", sessionId: "session",
    dataHome: "/tmp/pi-tuicr-review-owner-private", completionFile: "/tmp/pi-tuicr-review-owner-private/exit", accepted: {}, reported: [],
  };
  assert.ok(restoreReview(entry(complete), "owner"));
  assert.equal(restoreReview(entry({ ...complete, base: undefined }), "owner"), undefined);
  assert.equal(restoreReview(entry({ ...complete, completionFile: "/tmp/victim" }), "owner"), undefined);
});
