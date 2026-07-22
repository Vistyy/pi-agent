import type { Usage } from "@earendil-works/pi-ai";

export type ResponseItem = Record<string, unknown>;

export interface ContinuationSettings {
  instructions?: unknown;
  tools?: unknown;
  reasoning?: unknown;
  text?: unknown;
}

export interface OpenAIRemoteCompactionDetailsV1 {
  version: 1;
  replacementHistory: ResponseItem[];
  creatingModelId: string;
  compactionCompatibilityHash?: string;
  continuationSettings: ContinuationSettings;
}

export interface OpenAIRemoteCompactionEntryDetails {
  openaiRemoteCompaction: OpenAIRemoteCompactionDetailsV1;
}

export interface CodexRequestTemplate extends Record<string, unknown> {
  model: string;
  instructions?: unknown;
  input?: ResponseItem[];
  tools?: unknown;
  tool_choice?: unknown;
  parallel_tool_calls?: unknown;
  reasoning?: unknown;
  text?: unknown;
  prompt_cache_key?: unknown;
}

export interface RemoteCompactionResult {
  replacementHistory: ResponseItem[];
  usage?: Usage;
}
