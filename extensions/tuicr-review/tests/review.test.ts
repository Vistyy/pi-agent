import assert from "node:assert/strict";
import { test } from "vitest";
import { formatFeedback, GuidedReview } from "../src/review.ts";
import type { Comment, OwnedReview, PersistedReview } from "../src/types.ts";

const A = "a".repeat(40);
const B = "b".repeat(40);
const C = "c".repeat(40);

function harness() {
  let branch: any[] = [];
  const events: string[] = [];
  const sent: any[] = [];
  const sleeps: Array<() => void> = [];
  let launchCount = 0;
  let launchFailure: string | undefined;
  let exit: number | undefined;
  let tab = true;
  let data = true;
  let comments: Comment[] = [];
  let commentFailures = 0;
  let failingCommentsSession: string | undefined;
  let sessionExists = true;
  let cleanupWarnings: string[] = [];
  let cleanupTabClosed = true;
  const exact = (base: string, head: string): OwnedReview => ({
    targetKey: JSON.stringify({ cwd: "/repo", base, head }), cwd: "/repo", base, head,
    tabId: `tab-${launchCount}`, paneId: `pane-${launchCount}`, sessionId: `session-${launchCount}`,
    dataHome: `/tmp/pi-tuicr-review-owner-${launchCount}`, completionFile: `/tmp/pi-tuicr-review-owner-${launchCount}/exit`, accepted: {}, reported: [],
  });
  const ops = {
    async resolveComparison(_cwd: string, base: string, head: string) {
      events.push(`resolve:${base}:${head}`);
      return { base: base === "base" ? A : base === "next" ? B : base, head: head === "head" ? B : head === "next" ? C : head };
    },
    async launch(request: any) {
      launchCount += 1;
      events.push(`launch:${request.base}:${request.head}`);
      if (launchFailure) throw new Error(launchFailure);
      tab = true;
      data = true;
      exit = undefined;
      return exact(request.base, request.head);
    },
    async comments(review: OwnedReview) {
      events.push("comments");
      if (review.sessionId === failingCommentsSession) throw new Error("new session comments unavailable");
      if (commentFailures-- > 0) throw new Error("comments unavailable");
      return comments;
    },
    async sessionExists() { events.push("sessionExists"); return sessionExists; },
    async groundComment(review: OwnedReview, comment: Comment) {
      if (!comment.path || comment.start_line == null) return comment;
      const side = comment.side ?? "new";
      return { ...comment, grounding: { revision: side === "old" ? review.base : review.head, side, path: comment.path, startLine: comment.start_line, endLine: comment.end_line ?? comment.start_line, excerpt: ">> 2: exact" } };
    },
    async add(_review: OwnedReview, payload: any) { return `pi-${payload.content}`; },
    async completion() { events.push("completion"); return exit; },
    async tabExists() { events.push("tabExists"); return tab; },
    async dataExists() { return data; },
    async cleanup(review: OwnedReview) {
      events.push(`cleanup:${review.sessionId}`);
      if (cleanupTabClosed) tab = false;
      if (!cleanupWarnings.length) data = false;
      return { warnings: cleanupWarnings, tabClosed: cleanupTabClosed };
    },
    sleep(milliseconds: number) { if (milliseconds === 25) return Promise.resolve(); return new Promise<void>((resolve) => sleeps.push(resolve)); },
  };
  const pi = {
    appendEntry(customType: string, state: PersistedReview) { branch.push({ type: "custom", customType, data: structuredClone(state) }); },
    sendMessage(message: any) { sent.push(message); },
  };
  const context = { cwd: "/repo", sessionManager: { getSessionId: () => "owner", getBranch: () => branch } } as any;
  return {
    events, sent, ops, context, runtime: () => new GuidedReview(pi as any, ops as any),
    setExit(value: number | undefined) { exit = value; }, setTab(value: boolean) { tab = value; },
    setComments(value: Comment[]) { comments = value; }, setCommentFailures(value: number) { commentFailures = value; },
    setFailingCommentsSession(value: string | undefined) { failingCommentsSession = value; },
    setSessionExists(value: boolean) { sessionExists = value; },
    setLaunchFailure(value: string | undefined) { launchFailure = value; },
    setCleanup(value: { warnings: string[]; tabClosed: boolean }) {
      cleanupWarnings = value.warnings;
      cleanupTabClosed = value.tabClosed;
    },
    tick() { sleeps.splice(0).forEach((resolve) => resolve()); },
    launchCount: () => launchCount, branch: () => branch,
  };
}

const request = (base = "base", head = "head", replaceExisting = false) => ({ base, head, replaceExisting });
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

test("inspects liveness before comparing targets and a finished review does not require a second call", async () => {
  const h = harness();
  const runtime = h.runtime();
  await runtime.restore(h.context);
  await runtime.ensure(request(), h.context);
  h.events.length = 0;
  h.setExit(0);
  const result = await runtime.ensure(request("next", "next"), h.context);
  assert.equal(result.reused, false);
  assert.equal(h.launchCount(), 2);
  assert.ok(h.events.indexOf("completion") < h.events.indexOf("resolve:next:next"));
  assert.deepEqual({ base: result.base, head: result.head }, { base: B, head: C });
  runtime.shutdown();
});

test("rejects a different live review unless explicit replacement was requested", async () => {
  const h = harness();
  const runtime = h.runtime();
  await runtime.restore(h.context);
  await runtime.ensure(request(), h.context);
  await assert.rejects(runtime.ensure(request("next", "next"), h.context), /replaceExisting/);
  assert.equal(h.events.some((event) => event.startsWith("cleanup:")), false);
  runtime.shutdown();
});

test("replacement reads and returns old feedback before closing only the owned review", async () => {
  const h = harness();
  const runtime = h.runtime();
  await runtime.restore(h.context);
  await runtime.ensure(request(), h.context);
  h.setComments([{ id: "m1", author: "Maintainer", content: "Please explain", path: "src/a.ts", start_line: 2, side: "old" }]);
  h.events.length = 0;
  const result = await runtime.ensure(request("next", "next", true), h.context);
  assert.equal(result.replacedFeedback?.maintainer[0]?.content, "Please explain");
  assert.equal(result.replacedFeedback?.maintainer[0]?.grounding?.revision, A);
  assert.ok(h.events.indexOf("comments") < h.events.indexOf("cleanup:session-1"));
  assert.ok(h.events.indexOf("cleanup:session-1") < h.events.indexOf(`launch:${B}:${C}`));
  assert.match(result.replacedFeedback?.message ?? "", /unsaved editor text was not read or migrated/);
  runtime.shutdown();
});

test("explicit replacement restarts the same comparison", async () => {
  const h = harness();
  const runtime = h.runtime();
  await runtime.restore(h.context);
  await runtime.ensure(request(), h.context);
  const result = await runtime.ensure(request("base", "head", true), h.context);
  assert.equal(result.reused, false);
  assert.equal(h.launchCount(), 2);
  assert.ok(result.replacedFeedback);
  runtime.shutdown();
});

test("saved replacement feedback survives cleanup failure", async () => {
  const h = harness();
  const runtime = h.runtime();
  await runtime.restore(h.context);
  await runtime.ensure(request(), h.context);
  h.setComments([{ id: "m1", author: "Maintainer", content: "Keep this feedback" }]);
  h.setCleanup({ warnings: ["close failed"], tabClosed: false });
  await assert.rejects(
    runtime.ensure(request("next", "next", true), h.context),
    /Saved feedback from comparison being replaced:[\s\S]*Keep this feedback[\s\S]*resources were preserved[\s\S]*close failed/,
  );
  assert.equal(h.launchCount(), 1);
  h.setCleanup({ warnings: [], tabClosed: true });
  h.setExit(0);
  await settle(); h.tick(); await settle();
  assert.deepEqual(h.sent.at(-1).details.maintainer, [], "feedback returned in the tool error is not delivered twice");
  runtime.shutdown();
});

test("saved replacement feedback survives a new launch failure", async () => {
  const h = harness();
  const runtime = h.runtime();
  await runtime.restore(h.context);
  await runtime.ensure(request(), h.context);
  h.setComments([{ id: "m1", author: "Maintainer", content: "Keep this feedback" }]);
  h.setLaunchFailure("launch unavailable");
  await assert.rejects(
    runtime.ensure(request("next", "next", true), h.context),
    /Saved feedback from replaced comparison:[\s\S]*Keep this feedback[\s\S]*launch unavailable/,
  );
  runtime.shutdown();
});

test("saved replacement feedback survives initial seeding failure", async () => {
  const h = harness();
  const runtime = h.runtime();
  await runtime.restore(h.context);
  await runtime.ensure(request(), h.context);
  h.setComments([{ id: "m1", author: "Maintainer", content: "Important old feedback" }]);
  h.setFailingCommentsSession("session-2");
  await assert.rejects(
    runtime.ensure(request("next", "next", true), h.context),
    /Saved feedback from replaced comparison:[\s\S]*Important old feedback[\s\S]*initial annotation seeding failed[\s\S]*new session comments unavailable/,
  );
  assert.equal(h.launchCount(), 2);
  runtime.shutdown();
});

test("normal exit with Tuicr's removed empty session completes with zero comments", async () => {
  const h = harness();
  const runtime = h.runtime();
  await runtime.restore(h.context);
  await runtime.ensure(request(), h.context);
  h.setCommentFailures(3);
  h.setSessionExists(false);
  h.setExit(0);
  await settle(); h.tick(); await settle();
  assert.equal(h.sent.at(-1).details.status, "completed");
  assert.deepEqual(h.sent.at(-1).details.maintainer, []);
  assert.ok(h.events.some((event) => event.startsWith("cleanup:")));
});

test("other comment read failures remain failures and preserve owned resources", async () => {
  const h = harness();
  const runtime = h.runtime();
  await runtime.restore(h.context);
  await runtime.ensure(request(), h.context);
  h.setCommentFailures(3);
  h.setSessionExists(true);
  h.setExit(0);
  await assert.rejects(runtime.ensure(request("next", "next"), h.context), /resources were preserved/);
  assert.equal(h.launchCount(), 1);
  assert.equal(h.sent.at(-1).details.status, "failed");
  assert.match(h.sent.at(-1).details.message, /resources were preserved/);
  assert.equal(h.events.some((event) => event.startsWith("cleanup:")), false);
});

test("feedback names the exact comparison and distinguishes grounded cited lines", () => {
  const text = formatFeedback({
    status: "completed", sessionId: "s", base: A, head: B, seeded: [],
    maintainer: [{ id: "m", content: "verbatim", path: "a.ts", start_line: 2, grounding: { revision: B, side: "new", path: "a.ts", startLine: 2, endLine: 2, excerpt: "   1: before\n>> 2: cited" } }],
  });
  assert.match(text, new RegExp(`${A}\\.\\.${B}`));
  assert.match(text, /verbatim/);
  assert.match(text, /new a\.ts:2-2/);
  assert.match(text, />> 2: cited/);
});
