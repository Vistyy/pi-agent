import assert from "node:assert/strict";
import test from "node:test";

import { parseJudgeJson } from "../src/pi-semantic-judge.js";

const judgment = {
  behavior: "pass",
  reason: "The response uses the lifecycle evidence.",
  citations: [{ source: "decision-conversation", quote: "SessionCoordinator" }],
};

test("judge adapter parses a bare JSON object", () => {
  assert.deepEqual(parseJudgeJson(JSON.stringify(judgment)), judgment);
});

test("judge adapter normalizes one JSON Markdown fence", () => {
  assert.deepEqual(parseJudgeJson(`\`\`\`json\n${JSON.stringify(judgment)}\n\`\`\``), judgment);
});

test("judge adapter rejects prose surrounding structured output", () => {
  assert.throws(() => parseJudgeJson(`Result: ${JSON.stringify(judgment)}`), /invalid JSON/u);
});
