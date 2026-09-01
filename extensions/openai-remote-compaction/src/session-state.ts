import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import type {
  OpenAIRemoteCheckpoint,
  OpenAIRemoteCheckpointEntryDetails,
} from "./types.js";

export function isRemoteCheckpoint(
  value: unknown,
): value is OpenAIRemoteCheckpoint {
  if (!value || typeof value !== "object") return false;
  const details = value as Record<string, unknown>;
  return (
    Array.isArray(details.replacementHistory) &&
    details.replacementHistory.length > 0 &&
    details.replacementHistory.every(
      (item) =>
        typeof item === "object" &&
        item !== null &&
        (item as Record<string, unknown>).type === "compaction" &&
        typeof (item as Record<string, unknown>).encrypted_content === "string",
    ) &&
    typeof details.creatingModelId === "string"
  );
}

function checkpointFromEntry(entry: SessionEntry): OpenAIRemoteCheckpoint | undefined {
  if (entry.type !== "compaction") return undefined;
  const container = entry.details as Partial<OpenAIRemoteCheckpointEntryDetails> | undefined;
  return isRemoteCheckpoint(container?.openaiRemoteCheckpoint)
    ? container.openaiRemoteCheckpoint
    : undefined;
}

export function findActiveRemoteCheckpoint(
  branch: readonly SessionEntry[],
): OpenAIRemoteCheckpoint | undefined {
  for (let index = branch.length - 1; index >= 0; index -= 1) {
    const entry = branch[index];
    if (entry.type === "compaction") return checkpointFromEntry(entry);
  }
  return undefined;
}
