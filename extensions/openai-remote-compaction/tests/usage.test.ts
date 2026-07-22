import { describe, expect, it } from "vitest";
import { createUsageRecord } from "../src/usage.js";

describe("shared remote compaction usage", () => {
  it("creates the pi.usage.recorded schema used by /cost", () => {
    expect(
      createUsageRecord("gpt-test", {
        input: 20,
        output: 4,
        cacheRead: 80,
        cacheWrite: 0,
        totalTokens: 104,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      }),
    ).toEqual({
      schemaVersion: 1,
      source: "extension",
      extension: "openai-remote-compaction",
      operation: "remote-compaction",
      model: { provider: "openai-codex", id: "gpt-test" },
      usage: {
        input: 20,
        output: 4,
        cacheRead: 80,
        cacheWrite: 0,
        totalTokens: 104,
        cost: 0,
      },
    });
  });

  it("normalizes unavailable and invalid values", () => {
    expect(createUsageRecord("gpt-test").usage).toEqual({
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: 0,
    });
    expect(
      createUsageRecord("gpt-test", {
        input: 2,
        output: 3,
        cacheRead: Number.NaN,
        cacheWrite: -1,
        totalTokens: Number.POSITIVE_INFINITY,
        cost: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
          total: Number.NaN,
        },
      }).usage,
    ).toEqual({
      input: 2,
      output: 3,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 5,
      cost: 0,
    });
  });
});
