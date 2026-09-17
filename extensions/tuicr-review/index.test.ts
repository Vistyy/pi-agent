import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import extension, { TuicrReviewParameters } from "./index.ts";

test("registers exactly one agent-facing tool and no command or shortcut", () => {
  const tools: any[] = [];
  let commands = 0;
  let shortcuts = 0;
  const handlers: Record<string, Function> = {};
  extension({
    registerTool(tool: unknown) { tools.push(tool); },
    registerCommand() { commands += 1; },
    registerShortcut() { shortcuts += 1; },
    on(name: string, handler: Function) { handlers[name] = handler; },
    exec: async () => ({ code: 1, stdout: "", stderr: "not called" }),
    appendEntry() {},
    sendMessage() {},
  } as any);
  assert.deepEqual(tools.map((tool) => tool.name), ["tuicr_review"]);
  assert.equal(commands, 0);
  assert.equal(shortcuts, 0);
  assert.deepEqual(Object.keys(handlers).sort(), ["session_shutdown", "session_start", "session_tree"]);
});

test("public schema is strict at every object boundary", () => {
  assert.equal(TuicrReviewParameters.additionalProperties, false);
  const targetVariants = (TuicrReviewParameters.properties.target as any).anyOf;
  assert.ok(targetVariants.every((variant: any) => variant.additionalProperties === false));
  const annotationVariants = (TuicrReviewParameters.properties.annotations as any).items.anyOf;
  assert.ok(annotationVariants.every((variant: any) => variant.additionalProperties === false));
  const range = annotationVariants.find((variant: any) => variant.properties.startLine);
  assert.ok(range.properties.type, "comment taxonomy must remain optional, not absent or mandatory");
  assert.ok(!range.required.includes("type"));
});

test("Workgraph Worker visibility disables tuicr_review", async () => {
  const settings = JSON.parse(await readFile(new URL("../../settings.json", import.meta.url), "utf8"));
  const disabled = settings["pi-workgraph"].worker.disabledTools;
  assert.ok(disabled.includes("tuicr_review"));
  assert.equal(disabled.filter((name: string) => name === "tuicr_review").length, 1);
});
