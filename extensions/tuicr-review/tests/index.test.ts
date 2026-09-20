import assert from "node:assert/strict";
import { test } from "vitest";
import extension, { TuicrReviewParameters } from "../index.ts";

test("registers a committed-only exact comparison tool", () => {
  const tools: any[] = [];
  const handlers: string[] = [];
  extension({ registerTool(tool: unknown) { tools.push(tool); }, on(name: string) { handlers.push(name); } } as any);
  assert.deepEqual(tools.map((tool) => tool.name), ["tuicr_review"]);
  assert.deepEqual(handlers.sort(), ["session_shutdown", "session_start", "session_tree"]);

  const properties = TuicrReviewParameters.properties as any;
  assert.deepEqual(Object.keys(properties).sort(), ["annotations", "base", "cwd", "head", "replaceExisting"]);
  assert.equal(properties.base.type, "string");
  assert.equal(properties.head.type, "string");
  assert.equal(properties.replaceExisting.type, "boolean");
  assert.equal((TuicrReviewParameters as any).required.includes("replaceExisting"), true);
  assert.equal(JSON.stringify(TuicrReviewParameters).includes("workingTree"), false);
  assert.equal(JSON.stringify(TuicrReviewParameters).includes("revset"), false);
  assert.equal(JSON.stringify(TuicrReviewParameters).includes("includeWorkingTree"), false);

  const [tool] = tools;
  assert.ok(tool.promptGuidelines.some((guideline: string) => guideline.includes("answer it against the attached exact source")));
  assert.ok(tool.promptGuidelines.some((guideline: string) => guideline.includes("evidence, not authority")));
  assert.ok(tool.promptGuidelines.some((guideline: string) => guideline.includes("Ask for clarification rather than guessing")));
});
