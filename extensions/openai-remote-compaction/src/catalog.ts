import { buildCodexHeaders, type CodexAuth } from "./auth.js";
import { MODELS_URL } from "./constants.js";
import type { OpenAIRemoteCompactionDetailsV1 } from "./types.js";

interface CatalogCache {
  hashes: Map<string, string>;
  etag?: string;
  fetchedAt: number;
}

export interface CodexModelCatalogOptions {
  fetch?: typeof globalThis.fetch;
  now?: () => number;
  ttlMs?: number;
  timeoutMs?: number;
}

export class CodexModelCatalog {
  private readonly fetch: typeof globalThis.fetch;
  private readonly now: () => number;
  private readonly ttlMs: number;
  private readonly timeoutMs: number;
  private cache?: CatalogCache;
  private pending?: Promise<void>;

  constructor(options: CodexModelCatalogOptions = {}) {
    this.fetch = options.fetch ?? globalThis.fetch;
    this.now = options.now ?? Date.now;
    this.ttlMs = options.ttlMs ?? 5 * 60 * 1000;
    this.timeoutMs = options.timeoutMs ?? 5000;
  }

  peekHash(modelId: string): string | undefined {
    return this.cache?.hashes.get(modelId);
  }

  async getHash(modelId: string, auth: CodexAuth): Promise<string | undefined> {
    if (!this.cache || this.now() - this.cache.fetchedAt >= this.ttlMs) {
      this.pending ??= this.refresh(auth).finally(() => {
        this.pending = undefined;
      });
      await this.pending;
    }
    return this.cache?.hashes.get(modelId);
  }

  private async refresh(auth: CodexAuth): Promise<void> {
    const headers = buildCodexHeaders(auth);
    headers.Accept = "application/json";
    if (this.cache?.etag) headers["If-None-Match"] = this.cache.etag;

    try {
      const response = await this.fetch(MODELS_URL, {
        method: "GET",
        headers,
        signal: this.timeoutMs > 0 ? AbortSignal.timeout(this.timeoutMs) : undefined,
      });
      if (response.status === 304 && this.cache) {
        this.cache.fetchedAt = this.now();
        return;
      }
      if (!response.ok) return;
      const body = (await response.json()) as { models?: unknown };
      if (!Array.isArray(body.models)) return;
      const hashes = new Map<string, string>();
      for (const value of body.models) {
        if (!value || typeof value !== "object") continue;
        const model = value as Record<string, unknown>;
        if (typeof model.slug === "string" && typeof model.comp_hash === "string") {
          hashes.set(model.slug, model.comp_hash);
        }
      }
      this.cache = {
        hashes,
        ...(response.headers.get("etag") ? { etag: response.headers.get("etag")! } : {}),
        fetchedAt: this.now(),
      };
    } catch {
      // A prior valid catalog remains usable as stale compatibility evidence.
    }
  }
}

export function checkpointIsCompatible(
  checkpoint: OpenAIRemoteCompactionDetailsV1,
  modelId: string,
  currentHash: string | undefined,
): boolean {
  if (currentHash && checkpoint.compactionCompatibilityHash) {
    return currentHash === checkpoint.compactionCompatibilityHash;
  }
  return modelId === checkpoint.creatingModelId;
}
