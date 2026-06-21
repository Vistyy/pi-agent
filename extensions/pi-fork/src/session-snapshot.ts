export type ForkSessionSnapshotMode = "full" | "om-compact";

export interface SessionSnapshotSource {
  getHeader: () => unknown;
  getBranch: () => unknown[];
}

function buildFullSnapshot(header: unknown, entries: unknown[]): string {
  return `${[header, ...entries].map((entry) => JSON.stringify(entry)).join("\n")}\n`;
}

export function buildForkSessionSnapshotJsonl(
  sessionManager: SessionSnapshotSource,
): string | null {
  const header = sessionManager.getHeader();
  if (!header || typeof header !== "object") return null;

  return buildFullSnapshot(header, sessionManager.getBranch());
}
