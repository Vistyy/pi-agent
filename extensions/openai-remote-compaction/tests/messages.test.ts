import { describe, expect, it } from "vitest";
import { convertCodexMessages } from "../src/messages.js";

describe("Codex input conversion", () => {
  it("converts public Pi messages without provider-internal imports", () => {
    const reasoning = { type: "reasoning", id: "rs_1", encrypted_content: "secret", summary: [] };
    const messages = [
      { role: "user", content: "hello", timestamp: 1 },
      {
        role: "assistant",
        api: "openai-codex-responses",
        provider: "openai-codex",
        model: "gpt-test",
        content: [
          { type: "thinking", thinking: "", thinkingSignature: JSON.stringify(reasoning) },
          {
            type: "text",
            text: "answer",
            textSignature: JSON.stringify({ v: 1, id: "msg_1", phase: "final_answer" }),
          },
          { type: "toolCall", id: "call_1|fc_1", name: "read", arguments: { path: "a" } },
        ],
        stopReason: "toolUse",
        timestamp: 2,
      },
      {
        role: "toolResult",
        toolCallId: "call_1|fc_1",
        toolName: "read",
        content: [{ type: "text", text: "result" }],
        isError: false,
        timestamp: 3,
      },
    ];

    expect(convertCodexMessages({ id: "gpt-test", input: ["text"] }, messages as any)).toEqual([
      { role: "user", content: [{ type: "input_text", text: "hello" }] },
      reasoning,
      {
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text: "answer", annotations: [] }],
        status: "completed",
        id: "msg_1",
        phase: "final_answer",
      },
      {
        type: "function_call",
        id: "fc_1",
        call_id: "call_1",
        name: "read",
        arguments: '{"path":"a"}',
      },
      { type: "function_call_output", call_id: "call_1", output: "result" },
    ]);
  });

  it("preserves image and tool-error context according to model capability", () => {
    const messages = [
      {
        role: "user",
        content: [{ type: "image", data: "abc", mimeType: "image/png" }],
        timestamp: 1,
      },
      {
        role: "assistant",
        api: "openai-codex-responses",
        provider: "openai-codex",
        model: "gpt-test",
        content: [{ type: "toolCall", id: "call_1|fc_1", name: "look", arguments: {} }],
        stopReason: "toolUse",
        timestamp: 2,
      },
      {
        role: "toolResult",
        toolCallId: "call_1|fc_1",
        toolName: "look",
        content: [
          { type: "text", text: "failed" },
          { type: "image", data: "xyz", mimeType: "image/png" },
        ],
        isError: true,
        timestamp: 3,
      },
    ];

    const textOnly = convertCodexMessages({ id: "gpt-test", input: ["text"] }, messages as any);
    expect(textOnly[0]).toEqual({
      role: "user",
      content: [{ type: "input_text", text: "(image omitted: model does not support images)" }],
    });
    expect(textOnly.at(-1)).toEqual({
      type: "function_call_output",
      call_id: "call_1",
      output: "[Tool error]\nfailed\n(tool image omitted: model does not support images)",
    });

    const vision = convertCodexMessages({ id: "gpt-test", input: ["text", "image"] }, messages as any);
    expect(vision[0]).toEqual({
      role: "user",
      content: [
        { type: "input_image", detail: "auto", image_url: "data:image/png;base64,abc" },
      ],
    });
    expect(vision.at(-1)).toEqual({
      type: "function_call_output",
      call_id: "call_1",
      output: [
        { type: "input_text", text: "[Tool error]\nfailed" },
        { type: "input_image", detail: "auto", image_url: "data:image/png;base64,xyz" },
      ],
    });
  });

  it("does not replay encrypted reasoning from another model", () => {
    const messages = [
      {
        role: "assistant",
        api: "openai-codex-responses",
        provider: "openai-codex",
        model: "gpt-other",
        content: [
          {
            type: "thinking",
            thinking: "hidden",
            thinkingSignature: JSON.stringify({ type: "reasoning", encrypted_content: "secret" }),
          },
          { type: "text", text: "visible" },
          { type: "toolCall", id: "call_foreign|fc_foreign", name: "read", arguments: {} },
        ],
        stopReason: "stop",
        timestamp: 1,
      },
    ];

    expect(convertCodexMessages({ id: "gpt-test", input: ["text"] }, messages as any)).toEqual([
      {
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text: "hidden", annotations: [] }],
        status: "completed",
        id: "msg_pi_0",
      },
      {
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text: "visible", annotations: [] }],
        status: "completed",
        id: "msg_pi_0_1",
      },
      {
        type: "function_call",
        call_id: "call_foreign",
        name: "read",
        arguments: "{}",
      },
      {
        type: "function_call_output",
        call_id: "call_foreign",
        output: "No result provided",
      },
    ]);
  });
});
