import { describe, expect, it } from "vitest";
import { getResultSummaryText, processPiJsonLine } from "../src/runner/events.js";
import { emptyUsage, type ForkResult } from "../src/core/types.js";

function result(): ForkResult {
  return { task: "task", exitCode: -1, messages: [], stderr: "", usage: emptyUsage() };
}

describe("runner event parsing", () => {
  it("captures final assistant text and usage from message_end", () => {
    const r = result();
    const changed = processPiJsonLine(JSON.stringify({
      type: "message_end",
      message: {
        role: "assistant",
        provider: "p",
        model: "m",
        content: [{ type: "text", text: "done" }],
        usage: { input: 10, output: 5, cacheRead: 2, cacheWrite: 1, cost: { total: 0.2 }, totalTokens: 18 },
      },
    }), r);

    expect(changed).toBe(true);
    expect(getResultSummaryText(r)).toBe("done");
    expect(r.provider).toBe("p");
    expect(r.model).toBe("m");
    expect(r.usage).toMatchObject({ input: 10, output: 5, cacheRead: 2, cacheWrite: 1, cost: 0.2, turns: 1 });
  });

  it("ignores malformed JSON lines", () => {
    const r = result();
    expect(processPiJsonLine("not json", r)).toBe(false);
    expect(r.messages).toEqual([]);
  });
});
