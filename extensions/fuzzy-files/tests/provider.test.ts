import { describe, expect, it, vi } from "vitest";
import { createProvider } from "../src/provider.js";
import { SearchSession } from "../src/search.js";

describe("fuzzy provider", () => {
  it("uses the current provider while the first scan is pending", async () => {
    let resolveScan: ((value: { code: number; stdout: string; stderr: string }) => void) | undefined;
    const pi = {
      exec: vi.fn(() => new Promise((resolve) => { resolveScan = resolve; })),
    };
    const session = new SearchSession(pi as any, "/tmp/project", vi.fn());
    void session.warm();

    const current = {
      getSuggestions: vi.fn(async () => ({ items: [{ value: "fallback" }], prefix: "@" })),
      applyCompletion: vi.fn(),
    };
    const provider = createProvider(pi as any, session, current as any);
    const result = await provider.getSuggestions(["@src"], 0, 4, { signal: new AbortController().signal } as any);

    expect(result).toEqual({ items: [{ value: "fallback" }], prefix: "@" });
    expect(current.getSuggestions).toHaveBeenCalledOnce();

    session.dispose();
    resolveScan?.({ code: 0, stdout: "", stderr: "" });
  });
});
