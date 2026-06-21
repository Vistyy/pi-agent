import { describe, expect, it } from "vitest";
import { buildForkSessionSnapshotJsonl } from "../src/session-snapshot.js";

const header = { type: "session", id: "session-1" };

function message(id: string, text: string) {
  return { type: "message", id, parentId: null, timestamp: "2026-06-21T00:00:00.000Z", message: { role: "user", content: [{ type: "text", text }] } };
}

function session(entries: unknown[]) {
  return { getHeader: () => header, getBranch: () => entries };
}

function lines(jsonl: string): any[] {
  return jsonl.trim().split("\n").map((line) => JSON.parse(line));
}

describe("fork session snapshots", () => {
  it("copies the full active branch", () => {
    const entries = [message("raw-1", "one"), message("raw-2", "two")];

    const snapshot = buildForkSessionSnapshotJsonl(session(entries));

    expect(lines(snapshot ?? "")).toEqual([header, ...entries]);
  });

  it("returns null when the session header is unavailable", () => {
    expect(buildForkSessionSnapshotJsonl({ getHeader: () => null, getBranch: () => [] })).toBeNull();
  });
});
