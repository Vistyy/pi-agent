import type { Usage } from "@earendil-works/pi-ai";
import { CODEX_PROVIDER } from "./constants.js";

export interface UsageRecordedData {
  schemaVersion: 1;
  source: "extension";
  extension: "openai-remote-compaction";
  operation: "remote-compaction";
  model: { provider: "openai-codex"; id: string };
  usage: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    totalTokens: number;
    cost: number;
  };
}

export function createUsageRecord(modelId: string, usage: Usage): UsageRecordedData {
  return {
    schemaVersion: 1,
    source: "extension",
    extension: "openai-remote-compaction",
    operation: "remote-compaction",
    model: { provider: CODEX_PROVIDER, id: modelId },
    usage: {
      input: usage.input,
      output: usage.output,
      cacheRead: usage.cacheRead,
      cacheWrite: usage.cacheWrite,
      totalTokens: usage.totalTokens,
      cost: usage.cost.total,
    },
  };
}
