import { describe, expect, it } from "vitest";
import {
  buildRemoteCompactionRequest,
  buildToolsPayload,
  replaceMarkerWithRemoteCheckpoint,
} from "../src/request.js";
import { COMPACTION_MARKER } from "../src/constants.js";
import type { OpenAIRemoteCheckpoint } from "../src/types.js";

const markerText = `The conversation history before this point was compacted into the following summary:\n\n<summary>\n${COMPACTION_MARKER}\n</summary>`;

describe("remote compaction request", () => {
  it("builds fresh Codex settings and a trailing compaction trigger", () => {
    const request = buildRemoteCompactionRequest(
      {
        model: {
          id: "gpt-test",
          reasoning: true,
          thinkingLevelMap: { minimal: "low" },
        },
        instructions: "Be precise.",
        tools: [{ type: "function", name: "read" }],
        thinkingLevel: "minimal",
        sessionId: "session-1",
      },
      [{ role: "user", content: [{ type: "input_text", text: "current" }] }],
    );

    expect(request).toEqual({
      model: "gpt-test",
      instructions: "Be precise.",
      input: [
        { role: "user", content: [{ type: "input_text", text: "current" }] },
        { type: "compaction_trigger" },
      ],
      tools: [{ type: "function", name: "read" }],
      tool_choice: "auto",
      parallel_tool_calls: true,
      reasoning: { effort: "low", summary: "auto" },
      text: { verbosity: "low" },
      prompt_cache_key: "session-1",
      include: ["reasoning.encrypted_content"],
      store: false,
      stream: true,
    });
  });

  it("includes only currently active tools", () => {
    expect(
      buildToolsPayload(
        [
          { name: "read", description: "Read", parameters: { type: "object" } },
          { name: "write", description: "Write", parameters: { type: "object" } },
        ],
        ["read"],
      ),
    ).toEqual([
      {
        type: "function",
        name: "read",
        description: "Read",
        parameters: { type: "object" },
      },
    ]);
  });

  it("replaces only Pi's marker with the remote checkpoint", () => {
    const details: OpenAIRemoteCheckpoint = {
      replacementHistory: [{ type: "compaction", encrypted_content: "opaque" }],
      creatingModelId: "gpt-test",
    };

    expect(
      replaceMarkerWithRemoteCheckpoint(
        [
          { role: "user", content: [{ type: "input_text", text: markerText }] },
          { role: "user", content: [{ type: "input_text", text: "tail" }] },
        ],
        details,
      ),
    ).toEqual([
      { type: "compaction", encrypted_content: "opaque" },
      { role: "user", content: [{ type: "input_text", text: "tail" }] },
    ]);
  });
});
