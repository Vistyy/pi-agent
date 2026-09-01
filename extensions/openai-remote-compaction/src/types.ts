import type { Usage } from "@earendil-works/pi-ai";

export type ResponseItem = Record<string, unknown>;

export interface OpenAIRemoteCheckpoint {
  replacementHistory: ResponseItem[];
  creatingModelId: string;
  compactionCompatibilityHash?: string;
}

export interface OpenAIRemoteCheckpointEntryDetails {
  openaiRemoteCheckpoint: OpenAIRemoteCheckpoint;
}

export interface RemoteCompactionResult {
  replacementHistory: ResponseItem[];
  usage?: Usage;
}
