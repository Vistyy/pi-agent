import assert from "node:assert/strict";
import { Check } from "typebox/value";
import { test } from "vitest";
import { TuicrReviewParameters } from "../index.ts";

const comparison = { base: "main", head: "HEAD", replaceExisting: false };

test("accepts a comparison with or without scoped annotations", () => {
  assert.equal(Check(TuicrReviewParameters, comparison), true);
  assert.equal(Check(TuicrReviewParameters, {
    ...comparison,
    cwd: "/repo",
    replaceExisting: true,
    annotations: [
      { kind: "review", content: "Check the error handling." },
      { kind: "file", file: "src/main.ts", content: "This owns startup." },
      { kind: "line", file: "src/main.ts", line: 1, content: "The default changed." },
      { kind: "line", file: "src/main.ts", line: 2, side: "old", content: "Removed fallback." },
      { kind: "range", file: "src/main.ts", startLine: 3, endLine: 5, side: "new", content: "New initialization." },
    ],
  }), true);
});

test("rejects missing comparison fields, blank revisions, and unsupported options", () => {
  for (const input of [
    { head: "HEAD", replaceExisting: false },
    { base: "main", replaceExisting: false },
    { base: "main", head: "HEAD" },
    { ...comparison, base: "" },
    { ...comparison, head: " \n" },
    { ...comparison, replaceExisting: "false" },
    { ...comparison, cwd: " " },
    { ...comparison, workingTree: true },
    { ...comparison, revset: "main..HEAD" },
    { ...comparison, includeWorkingTree: true },
  ]) {
    assert.equal(Check(TuicrReviewParameters, input), false, JSON.stringify(input));
  }
});

test("rejects annotations with missing scope fields or invalid values", () => {
  for (const annotation of [
    { kind: "review", content: " " },
    { kind: "review", content: "Note", file: "src/main.ts" },
    { kind: "file", content: "Note" },
    { kind: "line", file: "src/main.ts", content: "Note" },
    { kind: "line", file: "src/main.ts", line: 0, content: "Note" },
    { kind: "line", file: "src/main.ts", line: 1.5, content: "Note" },
    { kind: "line", file: "src/main.ts", line: 1, side: "both", content: "Note" },
    { kind: "range", file: "src/main.ts", startLine: 1, content: "Note" },
    { kind: "range", file: "src/main.ts", startLine: 1, endLine: 0, content: "Note" },
    { kind: "unknown", content: "Note" },
  ]) {
    assert.equal(Check(TuicrReviewParameters, { ...comparison, annotations: [annotation] }), false, JSON.stringify(annotation));
  }
});
