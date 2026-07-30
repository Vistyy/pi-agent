import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import { INLINE_REMOTE_COMPACTION_ENTRY } from "./constants.js";
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
    details.continuationSettings !== null &&
    (details.inlineCoveredInputItemHash === undefined ||
      typeof details.inlineCoveredInputItemHash === "string") &&
    (details.inlineCoveredInputItemOccurrence === undefined ||
      (typeof details.inlineCoveredInputItemOccurrence === "number" &&
        Number.isInteger(details.inlineCoveredInputItemOccurrence) &&
        details.inlineCoveredInputItemOccurrence > 0))
  );
}

export interface ActiveRemoteCheckpoint {
  details: OpenAIRemoteCompactionDetailsV1;
  entryIndex: number;
}

function checkpointFromEntry(entry: SessionEntry): OpenAIRemoteCompactionDetailsV1 | undefined {
  if (entry.type === "compaction") {
    const container = entry.details as Partial<OpenAIRemoteCompactionEntryDetails> | undefined;
    return isRemoteCompactionDetails(container?.openaiRemoteCompaction)
      ? container.openaiRemoteCompaction
      : undefined;
  }
  if (entry.type === "custom" && entry.customType === INLINE_REMOTE_COMPACTION_ENTRY) {
    const container = entry.data as Partial<OpenAIRemoteCompactionEntryDetails> | undefined;
    return isRemoteCompactionDetails(container?.openaiRemoteCompaction)
      ? container.openaiRemoteCompaction
      : undefined;
  }
  return undefined;
}

export function findActiveRemoteCheckpointEntry(
  branch: readonly SessionEntry[],
): ActiveRemoteCheckpoint | undefined {
  for (let index = branch.length - 1; index >= 0; index -= 1) {
    const entry = branch[index];
    if (entry.type === "compaction") {
      const details = checkpointFromEntry(entry);
      return details ? { details, entryIndex: index } : undefined;
    }
    if (entry.type !== "custom" || entry.customType !== INLINE_REMOTE_COMPACTION_ENTRY) continue;
    const details = checkpointFromEntry(entry);
    if (details) return { details, entryIndex: index };
  }
  return undefined;
}

export function findActiveRemoteCheckpoint(
  branch: readonly SessionEntry[],
): OpenAIRemoteCompactionDetailsV1 | undefined {
  return findActiveRemoteCheckpointEntry(branch)?.details;
}
