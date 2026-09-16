import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import {
  type PullRequestQueryResult,
  type PullRequestSnapshot,
  type PullRequestTarget,
  parsePullRequestUrl,
  pullRequestKey,
  queryOwnedPullRequest,
} from "./github.ts";
import {
  FOLLOW_STATE_ENTRY,
  type PersistedFollow,
  actionableFingerprint,
  createFollowState,
  formatSteeringMessage,
  isTerminal,
  observedState,
  pullRequestLabel,
  restoreFollows,
  shouldSteer,
} from "./logic.ts";

const DEFAULT_POLL_MS = 30_000;
const MAX_BACKOFF_MS = 5 * 60_000;
const SUSTAINED_FAILURE_COUNT = 3;
const MAX_CONCURRENT_QUERIES = 4;
const WIDGET_ID = "pr-follow";

interface ObservedChange {
  readonly snapshot: PullRequestSnapshot;
  readonly fingerprint: string;
}

interface FollowRecord {
  target: PullRequestTarget;
  aliases: Set<string>;
  snapshot?: PullRequestSnapshot;
  fingerprint?: string;
  lastCheckedAt?: number;
  error?: string;
  failureCount: number;
  nextPollAt: number;
  notifiedFailure: boolean;
  conflictHead?: string;
}

export interface FollowResult {
  readonly followed: boolean;
  readonly alreadyFollowed: boolean;
  readonly snapshot: PullRequestSnapshot;
}

export interface UnfollowResult {
  readonly removed: boolean;
  readonly target: PullRequestTarget;
}

export interface RuntimeOptions {
  readonly pollMs?: number;
  readonly now?: () => number;
  readonly query?: (
    pi: Pick<ExtensionAPI, "exec">,
    url: string,
    signal?: AbortSignal,
  ) => Promise<PullRequestQueryResult>;
  readonly setTimer?: typeof setTimeout;
  readonly clearTimer?: typeof clearTimeout;
}

export class PrFollowRuntime {
  private readonly pi: ExtensionAPI;
  private readonly pollMs: number;
  private readonly now: () => number;
  private readonly query: NonNullable<RuntimeOptions["query"]>;
  private readonly setTimer: typeof setTimeout;
  private readonly clearTimer: typeof clearTimeout;
  private readonly records = new Map<string, FollowRecord>();
  private timer?: ReturnType<typeof setTimeout>;
  private controller?: AbortController;
  private context?: ExtensionContext;
  private generation = 0;
  private disposed = true;
  private deliveryPauseToken = 0;
  private deliveryPaused = false;
  private readonly pendingChanges = new Map<string, ObservedChange>();
  private operation: Promise<unknown> = Promise.resolve();

  constructor(
    pi: ExtensionAPI,
    options: RuntimeOptions = {},
  ) {
    this.pi = pi;
    this.pollMs = options.pollMs ?? DEFAULT_POLL_MS;
    this.now = options.now ?? Date.now;
    this.query = options.query ?? queryOwnedPullRequest;
    this.setTimer = options.setTimer ?? setTimeout;
    this.clearTimer = options.clearTimer ?? clearTimeout;
  }

  restore(ctx: ExtensionContext): Promise<void> {
    this.invalidate();
    this.deliveryPauseToken += 1;
    this.deliveryPaused = false;
    this.pendingChanges.clear();
    this.disposed = false;
    this.context = ctx;
    const generation = this.generation;

    return this.enqueue(async () => {
      if (!this.isCurrent(generation)) return;
      this.records.clear();

      const sessionId = ctx.sessionManager.getSessionId();
      const follows = restoreFollows(ctx.sessionManager.getBranch(), sessionId);
      for (const follow of follows) {
        const target = parsePullRequestUrl(follow.url);
        if (!target) continue;
        const aliases = follow.aliases.filter((alias) => parsePullRequestUrl(alias) !== undefined);
        this.records.set(pullRequestKey(target), restoredRecord(target, aliases, follow, this.now()));
      }

      this.render();
      await this.refreshCurrent(generation);
      this.schedule();
    });
  }

  pauseDelivery(): number {
    this.deliveryPaused = true;
    this.deliveryPauseToken += 1;
    return this.deliveryPauseToken;
  }

  resumeDelivery(token: number): void {
    if (!this.deliveryPaused || token !== this.deliveryPauseToken) return;
    this.deliveryPaused = false;
    this.flushPendingChanges();
  }

  stop(): void {
    this.invalidate();
    this.deliveryPauseToken += 1;
    this.deliveryPaused = false;
    this.pendingChanges.clear();
    this.disposed = true;
    this.records.clear();
    this.context?.ui.setWidget(WIDGET_ID, undefined);
    this.context = undefined;
  }

  follow(url: string, ctx: ExtensionContext, signal?: AbortSignal): Promise<FollowResult> {
    return this.enqueue(async () => {
      this.assertCurrentContext(ctx);
      const target = parsePullRequestUrl(url);
      if (!target) throw new Error("Expected an HTTPS GitHub pull-request URL.");

      const existingRequested = this.findRecord(target);
      const generation = this.generation;
      const sessionId = ctx.sessionManager.getSessionId();
      const result = await this.query(this.pi, target.url, signal);
      if (!this.isCurrent(generation)
        || this.context?.sessionManager.getSessionId() !== sessionId
        || signal?.aborted) {
        throw new Error("The active session changed before the pull request could be followed.");
      }
      if (!result.ok) {
        if (result.kind === "not-owned" && existingRequested) {
          this.records.delete(existingRequested[0]);
          this.commitFollowSet(ctx);
        }
        throw new Error(result.message);
      }

      const snapshot = result.snapshot;
      const key = pullRequestKey(snapshot.target);
      const existingEntry = this.findRecord(snapshot.target) ?? existingRequested;
      const existing = existingEntry?.[1];

      if (isTerminal(snapshot)) {
        if (existingEntry) {
          this.records.delete(existingEntry[0]);
          this.commitFollowSet(ctx);
        }
        return { followed: false, alreadyFollowed: Boolean(existing), snapshot };
      }

      if (existingEntry) this.records.delete(existingEntry[0]);
      const aliases = new Set(existing?.aliases);
      if (target.url !== snapshot.target.url) aliases.add(target.url);
      this.records.set(key, {
        target: snapshot.target,
        aliases,
        snapshot,
        fingerprint: actionableFingerprint(snapshot),
        lastCheckedAt: this.now(),
        failureCount: 0,
        nextPollAt: this.now() + this.pollMs,
        notifiedFailure: false,
        ...(snapshot.mergeability === "CONFLICTING" && snapshot.headRefOid
          ? { conflictHead: snapshot.headRefOid }
          : {}),
      });

      this.commitFollowSet(ctx);
      return { followed: true, alreadyFollowed: Boolean(existing), snapshot };
    });
  }

  unfollow(url: string, ctx: ExtensionContext): Promise<UnfollowResult> {
    return this.enqueue(async () => {
      this.assertCurrentContext(ctx);
      const target = parsePullRequestUrl(url);
      if (!target) throw new Error("Expected an HTTPS GitHub pull-request URL.");

      const entry = this.findRecord(target);
      const removed = entry ? this.records.delete(entry[0]) : false;
      if (removed) this.commitFollowSet(ctx);
      return { removed, target };
    });
  }

  refresh(ctx: ExtensionContext): Promise<void> {
    return this.enqueue(async () => {
      this.assertCurrentContext(ctx);
      await this.refreshCurrent(this.generation, true);
      this.schedule();
    });
  }

  followedCount(): number {
    return this.records.size;
  }

  details(): string {
    if (this.records.size === 0) return "No pull requests are followed on this conversation branch.";

    const records = [...this.records.values()].sort((left, right) =>
      pullRequestKey(left.target).localeCompare(pullRequestKey(right.target))
    );
    const lines = ["Followed pull requests", ""];

    for (const record of records) {
      const snapshot = record.snapshot;
      lines.push(`${snapshot ? statusGlyph(snapshot) : "?"} ${targetLabel(record.target)}`);
      lines.push(`  ${clickable(record.target.url, record.target.url)}`);
      if (snapshot) lines.push(`  ${observedState(snapshot).join(" · ")}`);
      else lines.push("  awaiting initial state");
      if (record.error) lines.push(`  stale: ${record.error}`);
      else if (record.lastCheckedAt) lines.push(`  checked ${formatAge(this.now() - record.lastCheckedAt)} ago`);
      lines.push("");
    }

    return lines.join("\n").trimEnd();
  }

  private async refreshCurrent(generation: number, force = false): Promise<void> {
    if (!this.isCurrent(generation) || this.records.size === 0) return;

    const now = this.now();
    const records = [...this.records.values()].filter((record) => force || record.nextPollAt <= now);
    if (records.length === 0) return;

    const controller = new AbortController();
    this.controller = controller;

    const results: Array<{ key: string; result: PullRequestQueryResult }> = [];
    for (let offset = 0; offset < records.length; offset += MAX_CONCURRENT_QUERIES) {
      const batch = records.slice(offset, offset + MAX_CONCURRENT_QUERIES);
      results.push(...await Promise.all(
        batch.map(async (record) => ({
          key: pullRequestKey(record.target),
          result: await this.query(this.pi, record.target.url, controller.signal),
        })),
      ));
      if (!this.isCurrent(generation) || controller.signal.aborted) return;
    }

    if (this.controller === controller) this.controller = undefined;
    if (!this.isCurrent(generation) || controller.signal.aborted) return;

    const changed: ObservedChange[] = [];
    let persistedStateChanged = false;

    for (const { key, result } of results) {
      const record = this.records.get(key);
      if (!record) continue;

      if (!result.ok) {
        if (result.kind === "not-owned") {
          this.records.delete(key);
          persistedStateChanged = true;
          this.context?.ui.notify(
            `Stopped following ${targetLabel(record.target)}: ${result.message}`,
            "warning",
          );
        } else {
          this.recordFailure(record, result);
        }
        continue;
      }

      const snapshot = result.snapshot;
      const previousFingerprint = record.fingerprint;
      const previousConflictHead = record.conflictHead;
      if (snapshot.mergeability === "CONFLICTING") record.conflictHead = snapshot.headRefOid || undefined;
      else if (snapshot.mergeability === "MERGEABLE" || record.conflictHead !== snapshot.headRefOid) {
        record.conflictHead = undefined;
      }
      const conflict = snapshot.mergeability === "CONFLICTING"
        || (snapshot.mergeability === "UNKNOWN" && record.conflictHead === snapshot.headRefOid);
      const fingerprint = actionableFingerprint(snapshot, conflict, previousFingerprint);
      const nextKey = pullRequestKey(snapshot.target);

      if (nextKey !== key) {
        record.aliases.add(record.target.url);
        this.records.delete(key);
        this.records.set(nextKey, record);
        persistedStateChanged = true;
      }
      record.target = snapshot.target;
      record.snapshot = snapshot;
      record.lastCheckedAt = now;
      record.error = undefined;
      record.failureCount = 0;
      record.nextPollAt = now + this.pollMs;
      record.notifiedFailure = false;
      record.fingerprint = fingerprint;

      if (fingerprint !== previousFingerprint || record.conflictHead !== previousConflictHead) {
        persistedStateChanged = true;
      }
      if (fingerprint && shouldSteer(previousFingerprint, fingerprint)) {
        changed.push({ snapshot, fingerprint });
      }
      if (isTerminal(snapshot)) {
        this.records.delete(nextKey);
        persistedStateChanged = true;
      }
    }

    if (persistedStateChanged && this.context) this.persist(this.context);
    this.render();

    for (const item of changed) {
      this.pendingChanges.set(pullRequestKey(item.snapshot.target), item);
    }
    if (!this.deliveryPaused) this.flushPendingChanges();
  }

  private flushPendingChanges(): void {
    if (this.pendingChanges.size === 0) return;
    const changed = [...this.pendingChanges.values()];
    this.pendingChanges.clear();

    this.pi.sendMessage(
      {
        customType: "pr-follow-change",
        content: formatSteeringMessage(changed.map((item) => item.snapshot)),
        display: true,
        details: {
          version: 1,
          pullRequests: changed.map(({ snapshot, fingerprint }) => ({
            url: snapshot.target.url,
            fingerprint,
          })),
        },
      },
      { deliverAs: "steer", triggerTurn: true },
    );
  }

  private recordFailure(record: FollowRecord, result: Exclude<PullRequestQueryResult, { ok: true }>): void {
    record.failureCount += 1;
    record.error = singleLine(result.message);
    record.nextPollAt = this.now() + Math.min(
      this.pollMs * (2 ** Math.max(0, record.failureCount - 1)),
      MAX_BACKOFF_MS,
    );

    const immediate = result.kind === "authentication" || result.kind === "missing-gh";
    if (!record.notifiedFailure && (immediate || record.failureCount >= SUSTAINED_FAILURE_COUNT)) {
      this.context?.ui.notify(
        `PR monitoring is stale for ${targetLabel(record.target)}: ${record.error}`,
        "warning",
      );
      record.notifiedFailure = true;
    }
  }

  private render(): void {
    const ctx = this.context;
    if (!ctx?.hasUI) return;
    if (this.records.size === 0) {
      ctx.ui.setWidget(WIDGET_ID, undefined);
      return;
    }

    const records = [...this.records.values()];
    const theme = ctx.ui.theme;
    const link = (target: PullRequestTarget) => clickable(target.url, targetLabel(target));

    if (records.length === 1) {
      const record = records[0]!;
      const status = record.snapshot
        ? theme.fg(statusColor(record.snapshot), statusGlyph(record.snapshot))
        : theme.fg("muted", "?");
      const stale = record.error ? ` ${theme.fg("muted", "stale")}` : "";
      ctx.ui.setWidget(
        WIDGET_ID,
        [`${theme.fg("accent", "PR")} ${link(record.target)} ${status}${stale}`],
        { placement: "aboveEditor" },
      );
      return;
    }

    const failed = records.filter((record) => (record.snapshot?.checks.failed.length ?? 0) > 0).length;
    const conflicts = records.filter((record) => record.snapshot?.mergeability === "CONFLICTING").length;
    const stale = records.filter((record) => record.error).length;
    const segments = [theme.fg("accent", `PRs ${records.length}`)];
    if (failed > 0) segments.push(theme.fg("error", `✕${failed}`));
    if (conflicts > 0) segments.push(theme.fg("warning", `‼${conflicts}`));
    if (stale > 0) segments.push(theme.fg("muted", `?${stale}`));

    ctx.ui.setWidget(WIDGET_ID, [segments.join("  ")], { placement: "aboveEditor" });
  }

  private commitFollowSet(ctx: ExtensionContext): void {
    this.persist(ctx);
    this.render();
    this.schedule();
  }

  private persist(ctx: ExtensionContext): void {
    this.pi.appendEntry(
      FOLLOW_STATE_ENTRY,
      createFollowState(
        ctx.sessionManager.getSessionId(),
        [...this.records.values()].map((record) => ({
          url: record.target.url,
          aliases: [...record.aliases],
          ...(record.fingerprint ? { fingerprint: record.fingerprint } : {}),
          ...(record.conflictHead ? { conflictHead: record.conflictHead } : {}),
        })),
      ),
    );
  }

  private findRecord(target: PullRequestTarget): [string, FollowRecord] | undefined {
    const key = pullRequestKey(target);
    const direct = this.records.get(key);
    if (direct) return [key, direct];

    for (const [recordKey, record] of this.records) {
      if ([...record.aliases].some((alias) => {
        const parsed = parsePullRequestUrl(alias);
        return parsed ? pullRequestKey(parsed) === key : false;
      })) {
        return [recordKey, record];
      }
    }

    return undefined;
  }

  private schedule(): void {
    if (this.timer) {
      this.clearTimer(this.timer);
      this.timer = undefined;
    }
    if (this.disposed || this.records.size === 0) return;

    const generation = this.generation;
    const earliest = Math.min(...[...this.records.values()].map((record) => record.nextPollAt));
    const delay = Math.max(0, earliest - this.now());
    this.timer = this.setTimer(() => {
      this.timer = undefined;
      void this.enqueue(async () => {
        await this.refreshCurrent(generation);
        if (this.isCurrent(generation)) this.schedule();
      });
    }, delay);
    this.timer.unref?.();
  }

  private invalidate(): void {
    this.generation += 1;
    this.controller?.abort();
    this.controller = undefined;
    if (this.timer) {
      this.clearTimer(this.timer);
      this.timer = undefined;
    }
  }

  private isCurrent(generation: number): boolean {
    return !this.disposed && generation === this.generation;
  }

  private assertCurrentContext(ctx: ExtensionContext): void {
    if (this.disposed || this.context?.sessionManager.getSessionId() !== ctx.sessionManager.getSessionId()) {
      throw new Error("Pull-request observation is not active for this session.");
    }
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operation.then(operation, operation);
    this.operation = result.then(() => undefined, () => undefined);
    return result;
  }
}

function restoredRecord(
  target: PullRequestTarget,
  aliases: readonly string[],
  follow: PersistedFollow,
  now: number,
): FollowRecord {
  return {
    target,
    aliases: new Set(aliases),
    ...(follow.fingerprint ? { fingerprint: follow.fingerprint } : {}),
    failureCount: 0,
    nextPollAt: now,
    notifiedFailure: false,
    ...(follow.conflictHead ? { conflictHead: follow.conflictHead } : {}),
  };
}

function targetLabel(target: PullRequestTarget): string {
  return `${target.owner}/${target.repository}#${target.number}`;
}

function statusGlyph(snapshot: PullRequestSnapshot): string {
  const issues: string[] = [];
  if (snapshot.checks.failed.length > 0) issues.push("✕");
  if (snapshot.mergeability === "CONFLICTING") issues.push("‼");
  if (issues.length > 0) return issues.join(" ");
  if (snapshot.checks.pending > 0 || snapshot.mergeability === "UNKNOWN") return "◷";
  return "✓";
}

function statusColor(snapshot: PullRequestSnapshot): "success" | "warning" | "error" {
  if (snapshot.checks.failed.length > 0) return "error";
  if (snapshot.mergeability === "CONFLICTING" || snapshot.checks.pending > 0 || snapshot.mergeability === "UNKNOWN") {
    return "warning";
  }
  return "success";
}

function clickable(url: string, label: string): string {
  return `\u001b]8;;${url}\u0007${label}\u001b]8;;\u0007`;
}

function singleLine(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 300);
}

function formatAge(milliseconds: number): string {
  const seconds = Math.max(0, Math.round(milliseconds / 1_000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.round(minutes / 60)}h`;
}
