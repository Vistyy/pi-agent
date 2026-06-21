import { describe, expect, it, vi } from "vitest";
import { activeOmReflections, buildForkSessionSnapshotJsonl } from "../src/session-snapshot.js";

const header = { type: "session", id: "session-1" };

function custom(id: string, customType: string, data: unknown) {
  return { type: "custom", id, parentId: null, timestamp: "2026-06-21T00:00:00.000Z", customType, data };
}

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
  it("keeps full snapshots unchanged by default", () => {
    const entries = [message("raw-1", "one"), message("raw-2", "two")];

    const snapshot = buildForkSessionSnapshotJsonl(session(entries));

    expect(lines(snapshot ?? "")).toEqual([header, ...entries]);
  });

  it("returns null when the session header is unavailable", () => {
    expect(buildForkSessionSnapshotJsonl({ getHeader: () => null, getBranch: () => [] })).toBeNull();
  });

  it("builds compact OM snapshots with active reflections and recent tail", () => {
    vi.setSystemTime(new Date("2026-06-21T12:00:00.000Z"));
    const entries = [
      message("raw-1", "old context"),
      custom("om-ref-1", "om.reflections.recorded", {
        reflections: [{ id: "ref_111111111111", kind: "reflection", content: "Old active reflection.", sources: ["obs_111111111111"], createdAt: "2026-06-21T00:00:00.000Z" }],
        coversUpToId: "raw-1",
      }),
      custom("om-ref-2", "om.reflections.recorded", {
        reflections: [{ id: "ref_222222222222", kind: "reflection", content: "Retired reflection.", sources: ["obs_222222222222"], createdAt: "2026-06-21T00:00:00.000Z" }],
        coversUpToId: "raw-1",
      }),
      custom("om-rewrite", "om.reflections.rewritten", { retiredReflectionIds: ["ref_222222222222"] }),
      message("raw-tail", "recent tail"),
    ];

    const snapshot = buildForkSessionSnapshotJsonl(session(entries), { mode: "om-compact", recentTailEntryCount: 1 });
    const parsed = lines(snapshot ?? "");

    expect(parsed).toHaveLength(3);
    expect(parsed[0]).toEqual(header);
    expect(parsed[1]).toMatchObject({ type: "compaction", summary: expect.stringContaining("Old active reflection.") });
    expect(parsed[1].summary).not.toContain("Retired reflection.");
    expect(parsed[1].details).toMatchObject({ type: "om.folded", reflections: [{ id: "ref_111111111111" }] });
    expect(parsed[2]).toMatchObject({ id: "raw-tail" });
    expect(snapshot?.length).toBeLessThan(JSON.stringify([header, ...entries]).length);
    vi.useRealTimers();
  });

  it("computes active OM reflections from recorded and retired events", () => {
    const active = activeOmReflections([
      custom("om-ref", "om.reflections.recorded", {
        reflections: [
          { id: "ref_111111111111", kind: "reflection", content: "Keep.", sources: ["obs_111111111111"] },
          { id: "ref_222222222222", kind: "reflection", content: "Retire.", sources: ["obs_222222222222"] },
        ],
      }),
      custom("om-rewrite", "om.reflections.rewritten", { retiredReflectionIds: ["ref_222222222222"] }),
    ]);

    expect(active.map((reflection) => reflection.id)).toEqual(["ref_111111111111"]);
  });
});
