import { describe, expect, it, vi } from "vitest";
import { CodexModelCatalog, checkpointIsCompatible } from "../src/catalog.js";
import type { OpenAIRemoteCompactionDetailsV1 } from "../src/types.js";

function checkpoint(
  creatingModelId: string,
  compactionCompatibilityHash?: string,
): OpenAIRemoteCompactionDetailsV1 {
  return {
    version: 1,
    replacementHistory: [{ type: "compaction", encrypted_content: "opaque" }],
    creatingModelId,
    ...(compactionCompatibilityHash ? { compactionCompatibilityHash } : {}),
    continuationSettings: {},
  };
}

describe("Codex model catalog", () => {
  it("reads comp_hash and caches the catalog", async () => {
    const fetch = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      new Response(
        JSON.stringify({
          models: [
            { slug: "gpt-a", comp_hash: "family-1" },
            { slug: "gpt-b", comp_hash: "family-1" },
          ],
        }),
        { status: 200, headers: { ETag: '"catalog-1"' } },
      ),
    );
    const catalog = new CodexModelCatalog({ fetch, now: () => 1000 });

    await expect(catalog.getHash("gpt-a", { token: "token", accountId: "account" })).resolves.toBe(
      "family-1",
    );
    await expect(catalog.getHash("gpt-b", { token: "token", accountId: "account" })).resolves.toBe(
      "family-1",
    );
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledWith(
      "https://chatgpt.com/backend-api/codex/models?client_version=0.145.0",
      expect.objectContaining({
        headers: expect.objectContaining({ originator: "pi" }),
      }),
    );
    expect(fetch.mock.calls[0]?.[1]?.headers).not.toEqual(
      expect.objectContaining({ version: expect.anything() }),
    );
  });

  it("uses Codex bundled compatibility metadata when refresh is unavailable", async () => {
    const catalog = new CodexModelCatalog({
      fetch: vi.fn(async () => new Response("unavailable", { status: 503 })),
    });
    const auth = { token: "token", accountId: "account" };

    await expect(catalog.getHash("gpt-5.6-luna", auth)).resolves.toBe("3000");
    await expect(catalog.getHash("gpt-5.6-sol", auth)).resolves.toBe("3000");
    await expect(catalog.getHash("gpt-5.6-terra", auth)).resolves.toBe("3000");
  });

  it("resolves Codex model aliases from the longest prefix and namespaced suffix", async () => {
    const catalog = new CodexModelCatalog({
      fetch: vi.fn(async () => new Response("unavailable", { status: 503 })),
    });
    const auth = { token: "token", accountId: "account" };

    await expect(catalog.getHash("gpt-5.6-sol-fast", auth)).resolves.toBe("3000");
    await expect(catalog.getHash("custom/gpt-5.6-luna", auth)).resolves.toBe("3000");
    await expect(catalog.getHash("bad!/gpt-5.6-luna", auth)).resolves.toBeUndefined();
    await expect(catalog.getHash("one/two/gpt-5.6-luna", auth)).resolves.toBeUndefined();
  });

  it("uses a listed remote catalog as the source of truth", async () => {
    const catalog = new CodexModelCatalog({
      fetch: vi.fn(async () =>
        new Response(
          JSON.stringify({
            models: [{ slug: "gpt-remote", comp_hash: "remote-1", visibility: "list" }],
          }),
        ),
      ),
    });
    const auth = { token: "token", accountId: "account" };

    await expect(catalog.getHash("gpt-remote", auth)).resolves.toBe("remote-1");
    await expect(catalog.getHash("gpt-5.6-luna", auth)).resolves.toBeUndefined();
  });

  it("keeps the last merged catalog stale when an update fails", async () => {
    let now = 0;
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ models: [{ slug: "gpt-a", comp_hash: "family-1" }] }), {
          status: 200,
          headers: { ETag: '"catalog-1"' },
        }),
      )
      .mockResolvedValueOnce(new Response("unavailable", { status: 503 }));
    const catalog = new CodexModelCatalog({ fetch, now: () => now, ttlMs: 10 });
    const auth = { token: "token", accountId: "account" };

    expect(await catalog.getHash("gpt-a", auth)).toBe("family-1");
    expect(catalog.peekHash("gpt-a")).toBe("family-1");
    now = 20;
    expect(catalog.peekHash("gpt-a")).toBeUndefined();
    expect(await catalog.getHash("gpt-a", auth)).toBe("family-1");
    expect(await catalog.getHash("gpt-a", auth)).toBe("family-1");
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(fetch).toHaveBeenLastCalledWith(
      "https://chatgpt.com/backend-api/codex/models?client_version=0.145.0",
      expect.objectContaining({ headers: expect.not.objectContaining({ "If-None-Match": expect.anything() }) }),
    );
  });

  it("rejects malformed model entries", async () => {
    const catalog = new CodexModelCatalog({
      fetch: vi.fn(async () =>
        new Response(JSON.stringify({ models: [{ slug: "gpt-a" }, { comp_hash: "hash" }] })),
      ),
    });

    await expect(
      catalog.getHash("gpt-a", { token: "token", accountId: "account" }),
    ).resolves.toBeUndefined();
  });
});

describe("remote checkpoint compatibility", () => {
  it("allows matching hashes across Codex model IDs", () => {
    expect(checkpointIsCompatible(checkpoint("gpt-a", "family-1"), "family-1")).toBe(true);
  });

  it("treats missing hashes as unknown and rejects only known hash changes", () => {
    expect(checkpointIsCompatible(checkpoint("gpt-a", "family-1"), undefined)).toBe(true);
    expect(checkpointIsCompatible(checkpoint("gpt-a"), "family-2")).toBe(true);
    expect(checkpointIsCompatible(checkpoint("gpt-a", "family-1"), "family-2")).toBe(false);
  });
});
