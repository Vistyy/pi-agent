import assert from "node:assert/strict";
import test from "node:test";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { FailedCheck, PullRequestQueryResult, PullRequestSnapshot } from "../src/github.ts";
import { FOLLOW_STATE_ENTRY } from "../src/logic.ts";
import { PrFollowRuntime } from "../src/runtime.ts";

const URL = "https://github.com/acme/widgets/pull/42";

function failure(name: string): FailedCheck {
  return { key: `${name}\u0000`, name };
}

function snapshot(options: {
  head?: string;
  lifecycle?: PullRequestSnapshot["lifecycle"];
  mergeability?: PullRequestSnapshot["mergeability"];
  pending?: number;
  failed?: readonly FailedCheck[];
  owner?: string;
  repository?: string;
  number?: number;
  url?: string;
} = {}): PullRequestSnapshot {
  const failed = options.failed ?? [];
  const pending = options.pending ?? 0;

  return {
    target: {
      host: "github.com",
      owner: options.owner ?? "acme",
      repository: options.repository ?? "widgets",
      number: options.number ?? 42,
      url: options.url ?? URL,
    },
    authorLogin: "Vistyy",
    lifecycle: options.lifecycle ?? "OPEN",
    headRefOid: options.head ?? "head-1",
    mergeability: options.mergeability ?? "MERGEABLE",
    checks: {
      total: failed.length + pending,
      passed: 0,
      pending,
      failed,
      settled: pending === 0,
    },
  };
}

function harness() {
  const branch: unknown[] = [];
  const messages: unknown[] = [];
  const notifications: string[] = [];
  const widgets: unknown[] = [];
  const queryResults: PullRequestQueryResult[] = [];
  const timerDelays: number[] = [];
  let currentTime = 10_000;

  const pi = {
    appendEntry(customType: string, data: unknown) {
      branch.push({ type: "custom", customType, data });
    },
    sendMessage(message: unknown, options: unknown) {
      messages.push({ message, options });
    },
  } as unknown as ExtensionAPI;

  const ctx = {
    hasUI: true,
    sessionManager: {
      getSessionId: () => "session-a",
      getBranch: () => branch,
    },
    ui: {
      theme: { fg: (_color: string, value: string) => value },
      setWidget: (...args: unknown[]) => widgets.push(args),
      notify: (value: string) => notifications.push(value),
    },
  } as unknown as ExtensionContext;

  const runtime = new PrFollowRuntime(pi, {
    now: () => currentTime,
    query: async () => {
      const result = queryResults.shift();
      if (!result) throw new Error("Missing query result");
      return result;
    },
    setTimer: ((_callback: () => void, delay?: number) => {
      timerDelays.push(delay ?? 0);
      return { unref() {} };
    }) as unknown as typeof setTimeout,
    clearTimer: (() => {}) as unknown as typeof clearTimeout,
  });

  return {
    branch,
    messages,
    notifications,
    widgets,
    queryResults,
    timerDelays,
    setCurrentTime(value: number) {
      currentTime = value;
    },
    pi,
    ctx,
    runtime,
  };
}

test("rejects foreign PRs and removes a follow when ownership changes", async () => {
  const h = harness();
  await h.runtime.restore(h.ctx);

  h.queryResults.push({
    ok: false,
    kind: "not-owned",
    message: "Authenticated account did not author this PR.",
  });
  await assert.rejects(h.runtime.follow(URL, h.ctx), /did not author/);
  assert.equal(h.runtime.followedCount(), 0);
  assert.equal(h.branch.length, 0);

  h.queryResults.push({ ok: true, snapshot: snapshot() });
  await h.runtime.follow(URL, h.ctx);
  h.queryResults.push({
    ok: false,
    kind: "not-owned",
    message: "Authenticated account no longer authors this PR.",
  });
  await h.runtime.refresh(h.ctx);

  assert.equal(h.runtime.followedCount(), 0);
  assert.equal(h.notifications.length, 1);
  assert.equal(h.messages.length, 0);
});

test("waits for settled checks, steers on new failures, and stays silent on recovery", async () => {
  const h = harness();
  await h.runtime.restore(h.ctx);

  h.queryResults.push({ ok: true, snapshot: snapshot({ pending: 1, failed: [failure("linux")] }) });
  const followed = await h.runtime.follow(URL, h.ctx);
  assert.equal(followed.followed, true);
  assert.equal(h.messages.length, 0);

  h.queryResults.push({ ok: true, snapshot: snapshot({ failed: [failure("linux")] }) });
  await h.runtime.refresh(h.ctx);
  assert.equal(h.messages.length, 1);

  h.queryResults.push({ ok: true, snapshot: snapshot({ failed: [failure("linux")] }) });
  await h.runtime.refresh(h.ctx);
  assert.equal(h.messages.length, 1, "unchanged failure must remain silent");

  h.queryResults.push({
    ok: true,
    snapshot: snapshot({ failed: [failure("linux"), failure("windows")] }),
  });
  await h.runtime.refresh(h.ctx);
  assert.equal(h.messages.length, 2, "newly failing check must steer");

  h.queryResults.push({ ok: true, snapshot: snapshot() });
  await h.runtime.refresh(h.ctx);
  assert.equal(h.messages.length, 2, "successful recovery must remain silent");

  h.queryResults.push({ ok: true, snapshot: snapshot({ failed: [failure("linux")] }) });
  await h.runtime.refresh(h.ctx);
  assert.equal(h.messages.length, 3, "failure recurrence after recovery must steer");
});

test("restore keeps the observation baseline and detects a failure after persisted recovery", async () => {
  const h = harness();
  await h.runtime.restore(h.ctx);

  const failed = snapshot({ failed: [failure("linux")] });
  h.queryResults.push({ ok: true, snapshot: failed });
  await h.runtime.follow(URL, h.ctx);

  h.queryResults.push({ ok: true, snapshot: failed });
  await h.runtime.restore(h.ctx);
  assert.equal(h.messages.length, 0, "unchanged restored failure must remain silent");

  h.queryResults.push({ ok: true, snapshot: snapshot() });
  await h.runtime.refresh(h.ctx);
  h.queryResults.push({ ok: true, snapshot: failed });
  await h.runtime.restore(h.ctx);

  assert.equal(h.messages.length, 1, "failure after persisted recovery must steer");
});

test("an unrelated pending check does not re-arm an accepted failure", async () => {
  const h = harness();
  await h.runtime.restore(h.ctx);
  h.queryResults.push({ ok: true, snapshot: snapshot() });
  await h.runtime.follow(URL, h.ctx);

  const failed = snapshot({ failed: [failure("linux")] });
  h.queryResults.push({ ok: true, snapshot: failed });
  await h.runtime.refresh(h.ctx);
  assert.equal(h.messages.length, 1);

  h.queryResults.push({
    ok: true,
    snapshot: snapshot({ pending: 1, failed: [failure("linux")] }),
  });
  await h.runtime.refresh(h.ctx);
  h.queryResults.push({ ok: true, snapshot: failed });
  await h.runtime.refresh(h.ctx);

  assert.equal(h.messages.length, 1);
});

test("temporary unknown mergeability does not repeat a conflict notification", async () => {
  const h = harness();
  await h.runtime.restore(h.ctx);

  h.queryResults.push({ ok: true, snapshot: snapshot() });
  await h.runtime.follow(URL, h.ctx);

  h.queryResults.push({ ok: true, snapshot: snapshot({ mergeability: "CONFLICTING" }) });
  await h.runtime.refresh(h.ctx);
  assert.equal(h.messages.length, 1);

  h.queryResults.push({ ok: true, snapshot: snapshot({ mergeability: "UNKNOWN" }) });
  await h.runtime.refresh(h.ctx);
  h.queryResults.push({ ok: true, snapshot: snapshot({ mergeability: "CONFLICTING" }) });
  await h.runtime.refresh(h.ctx);

  assert.equal(h.messages.length, 1);
});

test("unknown mergeability on a new head neither wakes nor suppresses its confirmed conflict", async () => {
  const h = harness();
  await h.runtime.restore(h.ctx);
  h.queryResults.push({
    ok: true,
    snapshot: snapshot({ head: "head-1", mergeability: "CONFLICTING" }),
  });
  await h.runtime.follow(URL, h.ctx);

  h.queryResults.push({
    ok: true,
    snapshot: snapshot({ head: "head-2", mergeability: "UNKNOWN" }),
  });
  await h.runtime.refresh(h.ctx);
  assert.equal(h.messages.length, 0);

  h.queryResults.push({
    ok: true,
    snapshot: snapshot({ head: "head-2", mergeability: "CONFLICTING" }),
  });
  await h.runtime.refresh(h.ctx);
  assert.equal(h.messages.length, 1);
});

test("canonical aliases can unfollow and unrelated operations preserve the earliest deadline", async () => {
  const h = harness();
  await h.runtime.restore(h.ctx);

  const original = "https://github.com/acme/old-name/pull/42";
  const canonical = "https://github.com/Acme/new-name/pull/42";
  h.queryResults.push({
    ok: true,
    snapshot: snapshot({ owner: "Acme", repository: "new-name", url: canonical }),
  });
  await h.runtime.follow(original, h.ctx);
  assert.equal(h.timerDelays.at(-1), 30_000);

  h.setCurrentTime(25_000);
  const second = "https://github.com/acme/api/pull/7";
  h.queryResults.push({
    ok: true,
    snapshot: snapshot({ repository: "api", number: 7, url: second }),
  });
  await h.runtime.follow(second, h.ctx);
  assert.equal(h.timerDelays.at(-1), 15_000, "the first PR remains due at 40 seconds");

  h.setCurrentTime(30_000);
  const scheduledTimers = h.timerDelays.length;
  await h.runtime.unfollow("https://github.com/acme/missing/pull/99", h.ctx);
  assert.equal(h.timerDelays.length, scheduledTimers, "a no-op unfollow cannot replace the existing timer");

  const removed = await h.runtime.unfollow(original, h.ctx);
  assert.equal(removed.removed, true, "the originally supplied redirected URL remains an alias");
});

test("explicitly following a now-terminal followed PR removes it without a second wake", async () => {
  const h = harness();
  await h.runtime.restore(h.ctx);
  h.queryResults.push({ ok: true, snapshot: snapshot() });
  await h.runtime.follow(URL, h.ctx);

  h.queryResults.push({ ok: true, snapshot: snapshot({ lifecycle: "CLOSED" }) });
  const result = await h.runtime.follow(URL, h.ctx);

  assert.equal(result.followed, false);
  assert.equal(result.alreadyFollowed, true);
  assert.equal(h.runtime.followedCount(), 0);
  assert.equal(h.messages.length, 0, "the calling tool already reports the terminal state");
});

test("terminal state steers once, persists removal, and stops following", async () => {
  const h = harness();
  await h.runtime.restore(h.ctx);

  h.queryResults.push({ ok: true, snapshot: snapshot() });
  await h.runtime.follow(URL, h.ctx);
  assert.equal(h.runtime.followedCount(), 1);

  h.queryResults.push({ ok: true, snapshot: snapshot({ lifecycle: "MERGED" }) });
  await h.runtime.refresh(h.ctx);

  assert.equal(h.runtime.followedCount(), 0);
  assert.equal(h.messages.length, 1);
  const finalEntry = h.branch.at(-1) as { customType: string; data: { follows: unknown[] } };
  assert.equal(finalEntry.customType, FOLLOW_STATE_ENTRY);
  assert.deepEqual(finalEntry.data.follows, []);
});

test("tree navigation defers an in-flight observation until a cancelled navigation resumes", async () => {
  const h = harness();
  await h.runtime.restore(h.ctx);
  h.queryResults.push({ ok: true, snapshot: snapshot() });
  await h.runtime.follow(URL, h.ctx);
  h.runtime.stop();

  let defer = false;
  let resolveQuery: ((result: PullRequestQueryResult) => void) | undefined;
  const runtime = new PrFollowRuntime(h.pi, {
    query: async () => defer
      ? new Promise<PullRequestQueryResult>((resolve) => {
          resolveQuery = resolve;
        })
      : { ok: true, snapshot: snapshot() },
    setTimer: (() => ({ unref() {} })) as unknown as typeof setTimeout,
    clearTimer: (() => {}) as unknown as typeof clearTimeout,
  });
  await runtime.restore(h.ctx);

  defer = true;
  const refresh = runtime.refresh(h.ctx);
  await Promise.resolve();
  const token = runtime.pauseDelivery();
  resolveQuery?.({ ok: true, snapshot: snapshot({ failed: [failure("linux")] }) });
  await refresh;

  assert.equal(h.messages.length, 0);
  runtime.resumeDelivery(token);
  assert.equal(h.messages.length, 1);
  assert.equal(runtime.followedCount(), 1);
});

test("a follow that completes after shutdown cannot persist state", async () => {
  const h = harness();
  let resolveQuery: ((result: PullRequestQueryResult) => void) | undefined;
  const runtime = new PrFollowRuntime(h.pi, {
    query: async () => new Promise<PullRequestQueryResult>((resolve) => {
      resolveQuery = resolve;
    }),
    setTimer: (() => ({ unref() {} })) as unknown as typeof setTimeout,
    clearTimer: (() => {}) as unknown as typeof clearTimeout,
  });
  await runtime.restore(h.ctx);

  const following = runtime.follow(URL, h.ctx);
  await Promise.resolve();
  runtime.stop();
  resolveQuery?.({ ok: true, snapshot: snapshot() });

  await assert.rejects(following, /active session changed/);
  assert.equal(h.branch.length, 0);
  assert.equal(runtime.followedCount(), 0);
});

test("a fork ignores copied follow state owned by its parent session", async () => {
  const h = harness();
  h.branch.push({
    type: "custom",
    customType: FOLLOW_STATE_ENTRY,
    data: {
      version: 1,
      ownerSessionId: "parent-session",
      follows: [{ url: URL, aliases: [] }],
    },
  });

  await h.runtime.restore(h.ctx);

  assert.equal(h.runtime.followedCount(), 0);
  assert.equal(h.queryResults.length, 0);
  assert.equal(h.messages.length, 0);
});
