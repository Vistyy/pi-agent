import { buildCodexHeaders, type CodexAuth } from "./auth.js";
import { MODELS_URL } from "./constants.js";
import type { OpenAIRemoteCompactionDetailsV1 } from "./types.js";

export const CODEX_CATALOG_CLIENT_VERSION = "0.145.0";

interface ModelMetadata {
  slug: string;
  compHash?: string;
  visibility?: string;
}

// Snapshot of the compatibility metadata bundled with OpenAI Codex 0.145.0.
// Source: openai/codex codex-rs/models-manager/models.json at 808d3c2702ce8eae007c457aa930e7c3b68dd5f6.
const BUNDLED_MODELS: readonly ModelMetadata[] = [
  { slug: "gpt-5.6-sol", compHash: "3000" },
  { slug: "gpt-5.6-terra", compHash: "3000" },
  { slug: "gpt-5.6-luna", compHash: "3000" },
  { slug: "gpt-5.5", compHash: "2911" },
  { slug: "gpt-5.4", compHash: "2911" },
  { slug: "gpt-5.4-mini", compHash: "2911" },
  { slug: "gpt-5.2" },
  { slug: "codex-auto-review" },
];

interface CatalogCache {
  models: ModelMetadata[];
  fetchedAt: number;
}

export interface CodexModelCatalogOptions {
  fetch?: typeof globalThis.fetch;
  now?: () => number;
  ttlMs?: number;
  timeoutMs?: number;
  clientVersion?: string;
}

function activeModels(remoteModels: readonly ModelMetadata[]): ModelMetadata[] {
  if (remoteModels.some((model) => model.visibility === "list")) {
    return [...remoteModels];
  }
  const merged = new Map(BUNDLED_MODELS.map((model) => [model.slug, model]));
  for (const model of remoteModels) merged.set(model.slug, model);
  return [...merged.values()];
}

function resolveHash(models: readonly ModelMetadata[], modelId: string): string | undefined {
  const longestPrefix = (candidateId: string) =>
    models
      .filter((model) => candidateId.startsWith(model.slug))
      .sort((left, right) => right.slug.length - left.slug.length)[0]?.compHash;
  const direct = longestPrefix(modelId);
  if (direct !== undefined) return direct;
  const separator = modelId.indexOf("/");
  if (separator <= 0 || modelId.indexOf("/", separator + 1) !== -1) return undefined;
  const namespace = modelId.slice(0, separator);
  if (!/^[a-zA-Z0-9_-]+$/.test(namespace)) return undefined;
  return longestPrefix(modelId.slice(separator + 1));
}

export class CodexModelCatalog {
  private readonly fetch: typeof globalThis.fetch;
  private readonly now: () => number;
  private readonly ttlMs: number;
  private readonly timeoutMs: number;
  private readonly clientVersion: string;
  private cache?: CatalogCache;
  private pending?: Promise<boolean>;

  constructor(options: CodexModelCatalogOptions = {}) {
    this.fetch = options.fetch ?? globalThis.fetch;
    this.now = options.now ?? Date.now;
    this.ttlMs = options.ttlMs ?? 5 * 60 * 1000;
    this.timeoutMs = options.timeoutMs ?? 5000;
    this.clientVersion = options.clientVersion ?? CODEX_CATALOG_CLIENT_VERSION;
  }

  peekHash(modelId: string): string | undefined {
    if (this.cache && this.now() - this.cache.fetchedAt >= this.ttlMs) return undefined;
    return resolveHash(this.cache?.models ?? BUNDLED_MODELS, modelId);
  }

  async getHash(modelId: string, auth: CodexAuth): Promise<string | undefined> {
    if (!this.cache || this.now() - this.cache.fetchedAt >= this.ttlMs) {
      this.pending ??= this.refresh(auth).finally(() => {
        this.pending = undefined;
      });
      await this.pending;
    }
    return resolveHash(this.cache?.models ?? BUNDLED_MODELS, modelId);
  }

  private async refresh(auth: CodexAuth): Promise<boolean> {
    const headers = buildCodexHeaders(auth);
    headers.Accept = "application/json";
    const url = new URL(MODELS_URL);
    url.searchParams.set("client_version", this.clientVersion);

    try {
      const response = await this.fetch(url.toString(), {
        method: "GET",
        headers,
        signal: this.timeoutMs > 0 ? AbortSignal.timeout(this.timeoutMs) : undefined,
      });
      if (!response.ok) {
        this.retainAvailableModels();
        return false;
      }
      const body = (await response.json()) as { models?: unknown };
      if (!Array.isArray(body.models)) {
        this.retainAvailableModels();
        return false;
      }
      const remoteModels: ModelMetadata[] = [];
      for (const value of body.models) {
        if (!value || typeof value !== "object") continue;
        const model = value as Record<string, unknown>;
        if (typeof model.slug !== "string") continue;
        remoteModels.push({
          slug: model.slug,
          ...(typeof model.comp_hash === "string" ? { compHash: model.comp_hash } : {}),
          ...(typeof model.visibility === "string" ? { visibility: model.visibility } : {}),
        });
      }
      this.cache = { models: activeModels(remoteModels), fetchedAt: this.now() };
      return true;
    } catch {
      this.retainAvailableModels();
      return false;
    }
  }

  private retainAvailableModels(): void {
    this.cache ??= {
      models: [...BUNDLED_MODELS],
      fetchedAt: this.now(),
    };
  }
}

export function checkpointIsCompatible(
  checkpoint: OpenAIRemoteCompactionDetailsV1,
  currentHash: string | undefined,
): boolean {
  if (currentHash && checkpoint.compactionCompatibilityHash) {
    return currentHash === checkpoint.compactionCompatibilityHash;
  }
  return true;
}
