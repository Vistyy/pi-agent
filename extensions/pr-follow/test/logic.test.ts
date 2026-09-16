import assert from "node:assert/strict";
import test from "node:test";
import type { FailedCheck, PullRequestSnapshot } from "../src/github.ts";
import {
  FOLLOW_STATE_ENTRY,
  actionableFingerprint,
  createFollowState,
  formatSteeringMessage,
  restoreFollows,
  shouldSteer,
} from "../src/logic.ts";

const URL = "https://github.com/acme/widgets/pull/42";

function snapshot(options: {
  head?: string;
  lifecycle?: PullRequestSnapshot["lifecycle"];
  mergeability?: PullRequestSnapshot["mergeability"];
  pending?: number;
  failed?: readonly FailedCheck[];
} = {}): PullRequestSnapshot {
  const failed = options.failed ?? [];
  const pending = options.pending ?? 0;

  return {
    target: {
      host: "github.com",
      owner: "acme",
      repository: "widgets",
      number: 42,
      url: URL,
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

function failure(name: string): FailedCheck {
  return { key: `${name}\u0000`, name };
}

function persisted(url: string, fingerprint?: string) {
  return {
    url,
    aliases: [],
    ...(fingerprint ? { fingerprint } : {}),
  };
}

test("restores only the latest follow set owned by the exact session on the active branch", () => {
  const branch = [
    {
      type: "custom",
      customType: FOLLOW_STATE_ENTRY,
      data: createFollowState("session-a", [persisted(URL)]),
    },
    {
      type: "custom",
      customType: FOLLOW_STATE_ENTRY,
      data: createFollowState("session-b", [persisted("https://github.com/acme/other/pull/7")]),
    },
    {
      type: "custom",
      customType: FOLLOW_STATE_ENTRY,
      data: createFollowState("session-a", [persisted(URL), persisted("https://github.com/acme/api/pull/9")]),
    },
  ];

  assert.deepEqual(restoreFollows(branch, "session-a").map((follow) => follow.url), [
    "https://github.com/acme/api/pull/9",
    URL,
  ]);
  assert.deepEqual(
    restoreFollows(branch.slice(0, 2), "session-a"),
    [],
    "a foreign latest snapshot cannot expose older state",
  );
  assert.deepEqual(restoreFollows(branch, "forked-session"), []);
  assert.deepEqual(
    restoreFollows([
      ...branch,
      { type: "custom", customType: FOLLOW_STATE_ENTRY, data: { version: 1 } },
    ], "session-a"),
    [],
    "a malformed latest snapshot must fail closed instead of restoring stale state",
  );
});

test("does not make failures actionable until all visible checks settle", () => {
  assert.equal(actionableFingerprint(snapshot({ pending: 1, failed: [failure("linux")] })), undefined);
  assert.ok(actionableFingerprint(snapshot({ failed: [failure("linux")] })));
});

test("pending checks preserve only the same-head accepted failure baseline", () => {
  const accepted = actionableFingerprint(snapshot({ failed: [failure("linux")] }));
  const sameHeadPending = actionableFingerprint(
    snapshot({ pending: 1, failed: [failure("linux")] }),
    false,
    accepted,
  );
  const newHeadPending = actionableFingerprint(
    snapshot({ head: "head-2", pending: 1, failed: [failure("linux")] }),
    false,
    accepted,
  );

  assert.equal(sameHeadPending, accepted);
  assert.equal(newHeadPending, undefined);
});

test("steers for new problems but not successful recovery", () => {
  const conflict = actionableFingerprint(snapshot({ mergeability: "CONFLICTING" }));
  const conflictAndFailure = actionableFingerprint(snapshot({
    mergeability: "CONFLICTING",
    failed: [failure("linux")],
  }));
  const conflictAfterRecovery = actionableFingerprint(snapshot({ mergeability: "CONFLICTING" }));
  const secondFailure = actionableFingerprint(snapshot({
    mergeability: "CONFLICTING",
    failed: [failure("linux"), failure("windows")],
  }));

  assert.equal(shouldSteer(undefined, conflict), true);
  assert.equal(shouldSteer(conflict, conflictAndFailure), true);
  assert.equal(shouldSteer(conflictAndFailure, conflictAfterRecovery), false);
  assert.equal(shouldSteer(conflictAndFailure, secondFailure), true);
  assert.equal(shouldSteer(conflictAndFailure, undefined), false);
});

test("terminal steering says monitoring ended", () => {
  const message = formatSteeringMessage([snapshot({ lifecycle: "MERGED" })]);

  assert.match(message, /Terminal pull requests have been unfollowed\./);
  assert.doesNotMatch(message, /continues recurring/);
});

test("steers again for the same failure on a new head and for terminal state", () => {
  const first = actionableFingerprint(snapshot({ head: "head-1", failed: [failure("linux")] }));
  const same = actionableFingerprint(snapshot({ head: "head-1", failed: [failure("linux")] }));
  const newHead = actionableFingerprint(snapshot({ head: "head-2", failed: [failure("linux")] }));
  const merged = actionableFingerprint(snapshot({ head: "head-2", lifecycle: "MERGED" }));

  assert.equal(shouldSteer(first, same), false);
  assert.equal(shouldSteer(first, newHead), true);
  assert.equal(shouldSteer(newHead, merged), true);
});
