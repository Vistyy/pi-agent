import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SessionManager, type SessionEntry } from "@earendil-works/pi-coding-agent";
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

  it("reconstructs a persisted remote checkpoint after reload", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pi-remote-compaction-"));
    try {
      const manager = SessionManager.create("/tmp/project", directory);
      manager.appendMessage({ role: "user", content: "hello", timestamp: 1 });
      const messageId = manager.appendMessage({
        role: "assistant",
        api: "openai-codex-responses",
        provider: "openai-codex",
        model: "gpt-test",
        content: [{ type: "text", text: "hi" }],
        usage: {
          input: 1,
          output: 1,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 2,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
        stopReason: "stop",
        timestamp: 2,
      });
      manager.appendCompaction(
        "marker",
        messageId,
        10,
        {
          openaiRemoteCompaction: {
            version: 1,
            replacementHistory: [{ type: "compaction", encrypted_content: "persisted" }],
            creatingModelId: "gpt-test",
            continuationSettings: {},
          },
        },
        true,
      );
      const sessionFile = manager.getSessionFile();
      expect(sessionFile).toBeTruthy();

      const reopened = SessionManager.open(sessionFile!);
      expect(findActiveRemoteCheckpoint(reopened.getBranch())?.replacementHistory).toEqual([
        { type: "compaction", encrypted_content: "persisted" },
      ]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
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
