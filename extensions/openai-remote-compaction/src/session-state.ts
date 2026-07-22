import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import type {
  OpenAIRemoteCompactionDetailsV1,
  OpenAIRemoteCompactionEntryDetails,
} from "./types.js";

export function isRemoteCompactionDetails(
  value: unknown,
): value is OpenAIRemoteCompactionDetailsV1 {
  if (!value || typeof value !== "object") return false;
  const details = value as Record<string, unknown>;
  return (
    details.version === 1 &&
    Array.isArray(details.replacementHistory) &&
    details.replacementHistory.length > 0 &&
    details.replacementHistory.every(
      (item) =>
        typeof item === "object" &&
        item !== null &&
        (item as Record<string, unknown>).type === "compaction" &&
        typeof (item as Record<string, unknown>).encrypted_content === "string",
    ) &&
    typeof details.creatingModelId === "string" &&
    typeof details.continuationSettings === "object" &&
    details.continuationSettings !== null
  );
}

export function findActiveRemoteCheckpoint(
  branch: readonly SessionEntry[],
): OpenAIRemoteCompactionDetailsV1 | undefined {
  for (let index = branch.length - 1; index >= 0; index -= 1) {
    const entry = branch[index];
    if (entry.type !== "compaction") continue;
    const container = entry.details as Partial<OpenAIRemoteCompactionEntryDetails> | undefined;
    return isRemoteCompactionDetails(container?.openaiRemoteCompaction)
      ? container.openaiRemoteCompaction
      : undefined;
  }
  return undefined;
}
