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

function nonNegative(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
}

export function createUsageRecord(modelId: string, usage?: Usage): UsageRecordedData {
  const input = nonNegative(usage?.input);
  const output = nonNegative(usage?.output);
  const cacheRead = nonNegative(usage?.cacheRead);
  const cacheWrite = nonNegative(usage?.cacheWrite);
  const componentTotal = input + output + cacheRead + cacheWrite;
  const reportedTotal = nonNegative(usage?.totalTokens);
  const cost = nonNegative(usage?.cost?.total);
  return {
    schemaVersion: 1,
    source: "extension",
    extension: "openai-remote-compaction",
    operation: "remote-compaction",
    model: { provider: CODEX_PROVIDER, id: modelId },
    usage: {
      input,
      output,
      cacheRead,
      cacheWrite,
      totalTokens: reportedTotal > 0 ? reportedTotal : componentTotal,
      cost,
    },
  };
}
