import assert from "node:assert/strict";
import test from "node:test";
import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import {
  AUDIT_SYSTEM_PROMPT,
  WRAP_UP_INVENTORY_MESSAGE,
  buildEvidencePrompt,
  estimateTokens,
  extractConversationEvidence,
  parseWrapUpModelSelection,
} from "./logic.ts";

const entry = (id: string, role: "user" | "assistant" | "toolResult", content: unknown): SessionEntry => ({
  type: "message",
  id,
  parentId: null,
  timestamp: "2026-01-01T00:00:00.000Z",
  message: {
    role,
    content,
    ...(role === "toolResult"
      ? { toolCallId: "call", toolName: "read", isError: false, timestamp: 1 }
      : role === "assistant"
        ? {
            api: "test",
            provider: "test",
            model: "test",
            usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
            stopReason: "stop",
            timestamp: 1,
          }
        : { timestamp: 1 }),
  },
} as SessionEntry);

test("extracts visible user and assistant text without operational payloads", () => {
  const evidence = extractConversationEvidence([
    entry("user-1", "user", [{ type: "text", text: "Question" }, { type: "image", data: "ignored", mimeType: "image/png" }]),
    entry("assistant-1", "assistant", [
      { type: "thinking", thinking: "private" },
      { type: "text", text: "Answer" },
      { type: "toolCall", id: "call", name: "read", arguments: { path: "secret" } },
    ]),
    entry("tool-1", "toolResult", [{ type: "text", text: "large tool body" }]),
    {
      type: "custom_message",
      id: "outcome",
      parentId: "tool-1",
      timestamp: "2026-01-01T00:00:01.000Z",
      customType: "worker-outcome",
      content: "Accepted handoff completed",
      display: true,
    },
    {
      type: "custom_message",
      id: "skill",
      parentId: "outcome",
      timestamp: "2026-01-01T00:00:02.000Z",
      customType: "inline-skill-invocation",
      content: "large skill instructions",
      display: true,
    },
  ] as SessionEntry[]);

  assert.match(evidence.text, /\[entry user-1\] USER\nQuestion/);
  assert.match(evidence.text, /\[entry assistant-1\] ASSISTANT\nAnswer/);
  assert.match(evidence.text, /DISPLAYED CONTEXT \(worker-outcome\)\nAccepted handoff completed/);
  assert.doesNotMatch(evidence.text, /private|secret|large tool body|large skill instructions/);
  assert.deepEqual(
    {
      entries: evidence.entryCount,
      users: evidence.userMessages,
      assistants: evidence.assistantMessages,
      displayedCustom: evidence.displayedCustomMessages,
      images: evidence.omittedImages,
    },
    { entries: 3, users: 1, assistants: 1, displayedCustom: 1, images: 1 },
  );
});

test("preserves assistant terminal failure metadata even without visible text", () => {
  const failed = entry("assistant-error", "assistant", []) as Extract<SessionEntry, { type: "message" }>;
  if (failed.message.role !== "assistant") throw new Error("invalid fixture");
  failed.message.stopReason = "error";
  failed.message.errorMessage = "provider failed";

  const evidence = extractConversationEvidence([failed]);

  assert.match(evidence.text, /assistant response ended with error: provider failed/);
  assert.equal(evidence.assistantMessages, 1);
});

test("excludes an earlier generated wrap-up response until the next user message", () => {
  const evidence = extractConversationEvidence([
    entry("user-1", "user", "Original question"),
    {
      type: "custom_message",
      id: "audit",
      parentId: "user-1",
      timestamp: "2026-01-01T00:00:01.000Z",
      customType: WRAP_UP_INVENTORY_MESSAGE,
      content: "audit artifact",
      display: false,
    },
    entry("old-report", "assistant", [{ type: "text", text: "Previous generated wrap-up" }]),
    entry("user-2", "user", "New discussion"),
    entry("assistant-2", "assistant", [{ type: "text", text: "New answer" }]),
  ] as SessionEntry[]);

  assert.doesNotMatch(evidence.text, /Previous generated wrap-up/);
  assert.match(evidence.text, /Original question/);
  assert.match(evidence.text, /New discussion/);
  assert.match(evidence.text, /New answer/);
});

test("parses provider/model and thinking level settings", () => {
  assert.deepEqual(
    parseWrapUpModelSelection({
      "wrap-up": { model: " openrouter/openai/gpt-test ", thinkingLevel: "xhigh" },
    }),
    { provider: "openrouter", model: "openai/gpt-test", thinkingLevel: "xhigh" },
  );
  assert.equal(parseWrapUpModelSelection({}), undefined);
  assert.throws(
    () => parseWrapUpModelSelection({ "wrap-up": { model: "gpt-test", thinkingLevel: "high" } }),
    /provider\/model/,
  );
  assert.throws(
    () => parseWrapUpModelSelection({ "wrap-up": { model: "openai/gpt-test", thinkingLevel: "extreme" } }),
    /thinkingLevel/,
  );
});

test("audit prompt inventories explicit evidence without making the final decision", () => {
  assert.match(AUDIT_SYSTEM_PROMPT, /evidence for the final agent, not the final determination/);
  assert.match(AUDIT_SYSTEM_PROMPT, /none found/);
  assert.doesNotMatch(AUDIT_SYSTEM_PROMPT, /\*\*Open loops remain\.\*\*/);
});

test("evidence prompt reports its exact source boundary and exclusions", () => {
  const evidence = extractConversationEvidence([entry("user-1", "user", "Question")]);
  const prompt = buildEvidencePrompt(evidence, { id: "session-1", cutoffEntryId: "user-1" });

  assert.match(prompt, /Session ID: session-1/);
  assert.match(prompt, /Cutoff entry: user-1/);
  assert.match(prompt, /Included displayed extension messages: 0/);
  assert.match(prompt, /Excluded by design: thinking blocks, tool calls/);
  assert.match(prompt, /<conversation-evidence>/);
  assert.equal(estimateTokens("12345"), 2);
});
