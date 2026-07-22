import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { findActiveRemoteCheckpoint } from "../src/session-state.js";

function base(id: string, parentId: string | null) {
  return { id, parentId, timestamp: "2026-01-01T00:00:00.000Z" };
}

describe("remote checkpoint reconstruction", () => {
  it("selects the latest remote checkpoint on the active branch", () => {
    const branch: SessionEntry[] = [
      {
        ...base("m1", null),
        type: "message",
        message: { role: "user", content: "hello", timestamp: 1 },
      },
      {
        ...base("c1", "m1"),
        type: "compaction",
        summary: "marker",
        firstKeptEntryId: "m1",
        tokensBefore: 10,
        details: {
          openaiRemoteCompaction: {
            version: 1,
            replacementHistory: [{ type: "compaction", encrypted_content: "one" }],
            creatingModelId: "gpt-test",
            continuationSettings: {},
          },
        },
      },
    ];

    expect(findActiveRemoteCheckpoint(branch)?.replacementHistory).toEqual([
      { type: "compaction", encrypted_content: "one" },
    ]);
  });

  it("treats a later ordinary Pi compaction as the end of the remote checkpoint chain", () => {
    const branch = [
      {
        ...base("c1", null),
        type: "compaction",
        summary: "marker",
        firstKeptEntryId: "m1",
        tokensBefore: 10,
        details: {
          openaiRemoteCompaction: {
            version: 1,
            replacementHistory: [{ type: "compaction", encrypted_content: "one" }],
            creatingModelId: "gpt-test",
            continuationSettings: {},
          },
        },
      },
      {
        ...base("c2", "c1"),
        type: "compaction",
        summary: "plain summary",
        firstKeptEntryId: "m2",
        tokensBefore: 8,
      },
    ] as SessionEntry[];

    expect(findActiveRemoteCheckpoint(branch)).toBeUndefined();
  });
});
