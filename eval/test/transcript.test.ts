import assert from "node:assert/strict";
import test from "node:test";

import { visibleTranscript } from "../src/trial.js";

test("interaction evidence contains only visible user and assistant text", () => {
  const transcript = visibleTranscript([
    { role: "user", content: [{ type: "text", text: "Choose an owner." }] },
    {
      role: "assistant",
      content: [
        { type: "thinking", thinking: "hidden reasoning", thinkingSignature: "encrypted" },
        { type: "toolCall", name: "read", arguments: { path: "src/file.ts" } },
      ],
    },
    { role: "toolResult", content: [{ type: "text", text: "secret tool output" }] },
    {
      role: "assistant",
      content: [
        { type: "text", text: "The coordinator should own it." },
        { type: "thinking", thinking: "more hidden reasoning" },
      ],
    },
  ]);

  assert.deepEqual(transcript, [
    { role: "user", text: "Choose an owner." },
    { role: "assistant", text: "The coordinator should own it." },
  ]);
});
