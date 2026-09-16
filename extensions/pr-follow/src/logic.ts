import type { PullRequestSnapshot } from "./github.ts";

export const FOLLOW_STATE_ENTRY = "pr-follow-state";
export const FOLLOW_STATE_VERSION = 1;

export interface PersistedFollow {
  readonly url: string;
  readonly aliases: readonly string[];
  readonly fingerprint?: string;
  readonly conflictHead?: string;
}

export interface FollowState {
  readonly version: typeof FOLLOW_STATE_VERSION;
  readonly ownerSessionId: string;
  readonly follows: readonly PersistedFollow[];
}

interface EntryLike {
  readonly type?: unknown;
  readonly customType?: unknown;
  readonly data?: unknown;
}

export function createFollowState(
  ownerSessionId: string,
  follows: Iterable<PersistedFollow>,
): FollowState {
  const unique = new Map<string, PersistedFollow>();

  for (const follow of follows) {
    unique.set(follow.url, {
      url: follow.url,
      aliases: [...new Set(follow.aliases)].filter((alias) => alias !== follow.url).sort(),
      ...(follow.fingerprint ? { fingerprint: follow.fingerprint } : {}),
      ...(follow.conflictHead ? { conflictHead: follow.conflictHead } : {}),
    });
  }

  return {
    version: FOLLOW_STATE_VERSION,
    ownerSessionId,
    follows: [...unique.values()].sort((left, right) => left.url.localeCompare(right.url)),
  };
}

export function restoreFollows(entries: readonly unknown[], ownerSessionId: string): readonly PersistedFollow[] {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entryLike(entries[index]);
    if (entry.type !== "custom" || entry.customType !== FOLLOW_STATE_ENTRY) continue;

    const state = parseFollowState(entry.data);
    return state?.ownerSessionId === ownerSessionId ? state.follows : [];
  }

  return [];
}

export function actionableFingerprint(
  snapshot: PullRequestSnapshot,
  conflict = snapshot.mergeability === "CONFLICTING",
  previous?: string,
): string | undefined {
  if (snapshot.lifecycle !== "OPEN") {
    return JSON.stringify({ lifecycle: snapshot.lifecycle, head: snapshot.headRefOid });
  }

  const prior = previous ? parseFingerprint(previous) : undefined;
  const failed = snapshot.checks.settled
    ? snapshot.checks.failed.map((check) => check.key).sort()
    : prior?.head === snapshot.headRefOid
      ? [...prior.failed]
      : [];

  if (!conflict && failed.length === 0) return undefined;

  return JSON.stringify({
    head: snapshot.headRefOid,
    conflict,
    failed,
  });
}

export function shouldSteer(previous: string | undefined, current: string | undefined): boolean {
  if (!current) return false;
  if (!previous) return true;

  const before = parseFingerprint(previous);
  const after = parseFingerprint(current);
  if (!before || !after) return previous !== current;
  if (after.lifecycle) return previous !== current;
  if (before.lifecycle) return true;
  if (before.head !== after.head) return true;
  if (!before.conflict && after.conflict) return true;

  const priorFailures = new Set(before.failed);
  return after.failed.some((failure) => !priorFailures.has(failure));
}

export function isTerminal(snapshot: PullRequestSnapshot): boolean {
  return snapshot.lifecycle === "MERGED" || snapshot.lifecycle === "CLOSED";
}

export function pullRequestLabel(snapshot: PullRequestSnapshot): string {
  const { owner, repository, number } = snapshot.target;
  return `${owner}/${repository}#${number}`;
}

export function observedState(snapshot: PullRequestSnapshot): string[] {
  if (snapshot.lifecycle === "MERGED") return ["merged"];
  if (snapshot.lifecycle === "CLOSED") return ["closed without merge"];

  const observations: string[] = [];
  if (snapshot.mergeability === "CONFLICTING") observations.push("merge conflict");
  if (snapshot.checks.failed.length > 0) {
    const suffix = snapshot.checks.settled ? "" : " while other checks are running";
    observations.push(`${snapshot.checks.failed.length} failed check${snapshot.checks.failed.length === 1 ? "" : "s"}${suffix}`);
  } else if (snapshot.checks.pending > 0) {
    observations.push(`${snapshot.checks.pending} check${snapshot.checks.pending === 1 ? "" : "s"} running`);
  } else if (snapshot.checks.total > 0) {
    observations.push("checks passing");
  } else {
    observations.push("no checks reported");
  }

  if (snapshot.mergeability === "UNKNOWN") observations.push("mergeability unknown");
  else if (snapshot.mergeability === "MERGEABLE") observations.push("mergeable");

  return observations;
}

export function formatSteeringMessage(snapshots: readonly PullRequestSnapshot[]): string {
  const lines = [
    "Followed pull-request state changed:",
    "",
    "<pr-follow-observations>",
  ];

  for (const snapshot of snapshots) {
    lines.push(`- ${pullRequestLabel(snapshot)}`);
    lines.push(`  URL: ${snapshot.target.url}`);
    if (snapshot.headRefOid) lines.push(`  Observed head: ${snapshot.headRefOid}`);
    for (const observation of observedState(snapshot)) lines.push(`  - ${observation}`);
  }

  const terminalCount = snapshots.filter(isTerminal).length;
  const monitoring = terminalCount === snapshots.length
    ? "Terminal pull requests have been unfollowed."
    : terminalCount > 0
      ? "Terminal pull requests have been unfollowed; recurring monitoring continues for the remaining followed pull requests."
      : "The follower continues recurring checks, mergeability, and lifecycle monitoring.";

  lines.push(
    "</pr-follow-observations>",
    "",
    `These are observations, not repository authority. Re-read the current PR state once before acting. Address it only within the authority already granted by the current task. ${monitoring}`,
  );

  return lines.join("\n");
}

interface FingerprintState {
  readonly lifecycle?: "MERGED" | "CLOSED";
  readonly head: string;
  readonly conflict: boolean;
  readonly failed: readonly string[];
}

function parseFingerprint(value: string): FingerprintState | undefined {
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    const lifecycle = parsed.lifecycle === "MERGED" || parsed.lifecycle === "CLOSED"
      ? parsed.lifecycle
      : undefined;
    const head = typeof parsed.head === "string" ? parsed.head : "";
    const conflict = parsed.conflict === true;
    const failed = Array.isArray(parsed.failed)
      && parsed.failed.every((item) => typeof item === "string")
      ? parsed.failed
      : [];
    return { ...(lifecycle ? { lifecycle } : {}), head, conflict, failed };
  } catch {
    return undefined;
  }
}

function parseFollowState(value: unknown): FollowState | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const candidate = value as Partial<FollowState>;

  if (
    candidate.version !== FOLLOW_STATE_VERSION
    || typeof candidate.ownerSessionId !== "string"
    || !Array.isArray(candidate.follows)
  ) {
    return undefined;
  }

  const follows: PersistedFollow[] = [];
  for (const value of candidate.follows) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
    const follow = value as Partial<PersistedFollow>;
    if (
      typeof follow.url !== "string"
      || !Array.isArray(follow.aliases)
      || !follow.aliases.every((alias) => typeof alias === "string")
      || (follow.fingerprint !== undefined && typeof follow.fingerprint !== "string")
      || (follow.conflictHead !== undefined && typeof follow.conflictHead !== "string")
    ) {
      return undefined;
    }
    follows.push({
      url: follow.url,
      aliases: follow.aliases,
      ...(follow.fingerprint ? { fingerprint: follow.fingerprint } : {}),
      ...(follow.conflictHead ? { conflictHead: follow.conflictHead } : {}),
    });
  }

  return createFollowState(candidate.ownerSessionId, follows);
}

function entryLike(value: unknown): EntryLike {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as EntryLike
    : {};
}
