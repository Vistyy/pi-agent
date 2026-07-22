import { describe, expect, it } from "vitest";
import {
  buildRemoteCompactionRequest,
  replaceMarkerWithRemoteCheckpoint,
} from "../src/request.js";
import { COMPACTION_MARKER } from "../src/constants.js";
import type { OpenAIRemoteCompactionDetailsV1 } from "../src/types.js";

const markerText = `The conversation history before this point was compacted into the following summary:\n\n<summary>\n${COMPACTION_MARKER}\n</summary>`;

describe("remote compaction request", () => {
  it("uses stable Codex settings and a trailing compaction trigger", () => {
    const request = buildRemoteCompactionRequest(
      {
        model: "gpt-test",
        instructions: "Be precise.",
        input: [{ role: "user", content: [{ type: "input_text", text: "old" }] }],
        tools: [{ type: "function", name: "read" }],
        tool_choice: "auto",
        parallel_tool_calls: true,
        reasoning: { effort: "high", summary: "auto" },
        text: { verbosity: "low" },
        prompt_cache_key: "session-1",
        previous_response_id: "response-1",
        store: true,
        stream: false,
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
      reasoning: { effort: "high", summary: "auto" },
      text: { verbosity: "low" },
      prompt_cache_key: "session-1",
      include: ["reasoning.encrypted_content"],
      store: false,
      stream: true,
    });
  });

  it("replaces only Pi's marker with the remote checkpoint", () => {
    const details: OpenAIRemoteCompactionDetailsV1 = {
      version: 1,
      replacementHistory: [{ type: "compaction", encrypted_content: "opaque" }],
      creatingModelId: "gpt-test",
      continuationSettings: {},
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
