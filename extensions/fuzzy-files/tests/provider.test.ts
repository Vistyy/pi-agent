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
    const getReadyIndex = vi.spyOn(session, "getReadyIndex");
    const result = await provider.getSuggestions(["@src"], 0, 4, { signal: new AbortController().signal } as any);

    expect(result).toEqual({ items: [{ value: "fallback" }], prefix: "@" });
    expect(getReadyIndex).toHaveBeenCalledWith("project");
    expect(current.getSuggestions).toHaveBeenCalledOnce();

    session.dispose();
    resolveScan?.({ code: 0, stdout: "", stderr: "" });
  });

  it("routes @@ completion to the global index", async () => {
    const session = { getReadyIndex: vi.fn(() => undefined) };
    const current = {
      getSuggestions: vi.fn(async () => null),
      applyCompletion: vi.fn(),
    };
    const provider = createProvider({} as any, session as any, current as any);

    await provider.getSuggestions(["find @@button"], 0, 13, { signal: new AbortController().signal } as any);

    expect(session.getReadyIndex).toHaveBeenCalledWith("global");
  });
});
