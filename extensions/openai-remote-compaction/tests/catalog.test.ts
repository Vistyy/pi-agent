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
    const fetch = vi.fn(async () =>
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
  });

  it("keeps stale catalog evidence when refresh fails", async () => {
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
    expect(fetch).toHaveBeenLastCalledWith(
      "https://chatgpt.com/backend-api/codex/models",
      expect.objectContaining({ headers: expect.objectContaining({ "If-None-Match": '"catalog-1"' }) }),
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
    expect(checkpointIsCompatible(checkpoint("gpt-a", "family-1"), "gpt-b", "family-1")).toBe(true);
  });

  it("allows the creating model when catalog evidence is unavailable", () => {
    expect(checkpointIsCompatible(checkpoint("gpt-a", "family-1"), "gpt-a", undefined)).toBe(true);
  });

  it("rejects a different model with an unknown or different hash", () => {
    expect(checkpointIsCompatible(checkpoint("gpt-a", "family-1"), "gpt-b", undefined)).toBe(false);
    expect(checkpointIsCompatible(checkpoint("gpt-a", "family-1"), "gpt-b", "family-2")).toBe(false);
  });
});
