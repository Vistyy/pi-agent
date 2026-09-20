import assert from "node:assert/strict";
import { test } from "vitest";
import extension, { TuicrReviewParameters } from "../index.ts";

test("registers exactly one tool with optional scoped annotations and no comment type", () => {
  const tools: any[] = [];
  const handlers: string[] = [];
  extension({
    registerTool(tool: unknown) { tools.push(tool); },
    on(name: string) { handlers.push(name); },
  } as any);
  assert.deepEqual(tools.map((tool) => tool.name), ["tuicr_review"]);
  assert.deepEqual(handlers.sort(), ["session_shutdown", "session_start", "session_tree"]);

  const [tool] = tools;
  assert.match(tool.description, /guide the Maintainer through the change/);
  assert.match(tool.description, /concerns and trade-offs/);
  assert.ok(tool.promptGuidelines.some((guideline: string) =>
    guideline.includes("without reconstructing the implementation from scratch")
  ));
  assert.ok(tool.promptGuidelines.some((guideline: string) =>
    guideline.includes("state uncertainty or a questionable choice honestly")
  ));
  assert.ok(tool.promptGuidelines.some((guideline: string) =>
    guideline.includes("what the cited code does and why it matters in plain project terms")
  ));

  const variants = (TuicrReviewParameters.properties.annotations as any).items.anyOf;
  assert.equal(variants.length, 4);
  assert.ok(variants.every((variant: any) => !variant.properties.type));
  const located = variants.filter((variant: any) => variant.properties.line || variant.properties.startLine);
  assert.ok(located.every((variant: any) => variant.properties.side));
});
