import type { ExtensionAPI, ToolCallEvent } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { registerHerdrFocusPolicy } from "../src/extension.js";
import { HERDR_FOCUS_BLOCK_MESSAGE } from "../src/policy.js";

type Handler = (event: never) => unknown;

function registerPolicy() {
  let handler: Handler | undefined;
  const pi = {
    on(event: string, registered: Handler) {
      if (event === "tool_call") handler = registered;
    },
  } as unknown as ExtensionAPI;
  registerHerdrFocusPolicy(pi);
  return handler;
}

describe("Herdr focus policy extension", () => {
  it("blocks an agent bash call that changes Herdr focus", () => {
    const result = registerPolicy()?.({
      type: "tool_call",
      toolCallId: "focus-call",
      toolName: "bash",
      input: { command: "herdr pane split --current --focus" },
    } as ToolCallEvent as never);

    expect(result).toEqual({ block: true, reason: HERDR_FOCUS_BLOCK_MESSAGE });
  });

  it("does not block non-bash tools", () => {
    const result = registerPolicy()?.({
      type: "tool_call",
      toolCallId: "other-call",
      toolName: "read",
      input: { path: "herdr pane focus" },
    } as ToolCallEvent as never);

    expect(result).toBeUndefined();
  });
});
