import assert from "node:assert/strict";
import { test } from "vitest";
import { GuidedReview } from "../src/review.ts";
import { STATE_ENTRY } from "../src/model.ts";
import type { Comment, OwnedReview, PersistedReview } from "../src/types.ts";

const baseReview = (): OwnedReview => ({
  targetKey: JSON.stringify({ cwd: "/repo", target: { kind: "workingTree" } }),
  cwd: "/repo",
  tabId: "w:tab-1",
  paneId: "w:pane-1",
  sessionId: "exact-session",
  dataHome: "/tmp/private-tuicr",
  completionFile: "/tmp/private-tuicr/exit",
  accepted: {},
});

function harness() {
  const branch: any[] = [];
  const events: string[] = [];
  const sent: any[] = [];
  const added: Record<string, unknown>[] = [];
  const sleeps: Array<() => void> = [];
  let launchCount = 0;
  let addFailures = 0;
  let exit: number | undefined;
  let exists = true;
  let comments: Comment[] = [];
  let launchError: Error | undefined;
  const ops = {
    async launch(request: any, _owner: string, signal?: AbortSignal) {
      launchCount += 1;
      if (signal?.aborted) throw signal.reason;
      if (launchError) throw launchError;
      return { ...baseReview(), targetKey: request.targetKey, cwd: request.cwd, accepted: {} };
    },
    async add(_review: OwnedReview, payload: Record<string, unknown>) {
      added.push(payload);
      if (addFailures-- > 0) throw new Error("anchor rejected");
      const id = `p${added.length}`;
      comments.push({
        id, content: String(payload.content), author: "Pi",
        ...(payload.file ? { path: String(payload.file) } : {}),
        ...(payload.line ? { start_line: Number(payload.line), end_line: Number(payload.line) } : {}),
        ...(payload.start_line ? { start_line: Number(payload.start_line), end_line: Number(payload.end_line) } : {}),
      });
      return id;
    },
    async comments() { return comments; },
    async completion() { return exit; },
    async tabExists() { return exists; },
    async cleanup(review: OwnedReview) { events.push(`cleanup:${review.tabId}:${review.paneId}:${review.dataHome}`); return []; },
    sleep() { return new Promise<void>((resolve) => sleeps.push(resolve)); },
  };
  const pi = {
    appendEntry(customType: string, data: PersistedReview) {
      events.push(`persist:${data.state}`);
      branch.push({ type: "custom", customType, data: structuredClone(data) });
    },
    sendMessage(message: unknown, options: unknown) { events.push("deliver"); sent.push({ message, options }); },
  };
  const context = {
    cwd: "/repo",
    sessionManager: { getSessionId: () => "pi-session", getBranch: () => branch },
  } as any;
  const runtime = new GuidedReview(pi as any, ops as any, ops as any, ops as any);
  return {
    runtime, context, branch, events, sent, added,
    setAddFailures(value: number) { addFailures = value; },
    setExit(value: number | undefined) { exit = value; },
    setExists(value: boolean) { exists = value; },
    setComments(value: Comment[]) { comments = value; },
    setLaunchError(value: Error) { launchError = value; },
    tick() { sleeps.splice(0).forEach((resolve) => resolve()); },
    launchCount: () => launchCount,
  };
}

const lineRequest = (content = "Explain this") => ({
  target: { kind: "workingTree" as const },
  annotations: [{ kind: "line" as const, file: "src/a.ts", line: 4, side: "new" as const, content }],
});
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

test("launches once, persists compact ready ownership, and reuses with dedup/retry/revision", async () => {
  const h = harness();
  await h.runtime.restore(h.context);
  h.setAddFailures(1);
  const opened = await h.runtime.ensure(lineRequest(), h.context);
  assert.equal(opened.reused, false);
  assert.equal(opened.failures.length, 1);
  assert.equal((h.branch[0].data as PersistedReview).state, "active");
  assert.deepEqual(Object.keys(h.branch[0].data.review).sort(), [
    "accepted", "completionFile", "cwd", "dataHome", "paneId", "sessionId", "tabId", "targetKey",
  ]);

  const retried = await h.runtime.ensure(lineRequest(), h.context);
  assert.deepEqual(retried.acceptedCommentIds, ["p2"]);
  await h.runtime.ensure(lineRequest(), h.context);
  assert.equal(h.added.length, 2, "accepted annotation is not duplicated");
  const changed = await h.runtime.ensure(lineRequest("Different context"), h.context);
  assert.deepEqual(changed.acceptedCommentIds, ["p2", "p3"]);
  assert.equal(h.launchCount(), 1);
  h.runtime.shutdown();
});

test("rejects a different normalized target while active", async () => {
  const h = harness();
  await h.runtime.restore(h.context);
  await h.runtime.ensure(lineRequest(), h.context);
  await assert.rejects(h.runtime.ensure({ target: { kind: "revisions", revset: "main..HEAD" } }, h.context), /different Tuicr review/);
  h.runtime.shutdown();
});

test("completion reads exact comments without truncation, persists first, cleans exact ownership, then follows up", async () => {
  const h = harness();
  await h.runtime.restore(h.context);
  await h.runtime.ensure(lineRequest(), h.context);
  const long = `first\n${"x".repeat(900)}\nlast`;
  h.setComments([
    { id: "p1", author: "Pi", content: "Explain this", path: "src/a.ts", start_line: 4 },
    { id: "m1", author: "Maintainer", content: long, location: "review" },
  ]);
  h.setExit(0);
  h.tick();
  await settle();

  const finished = h.branch.findLast((entry) => entry.data.state === "finished").data;
  assert.deepEqual(finished.feedback.seeded.map((comment: Comment) => comment.id), ["p1"]);
  assert.deepEqual(finished.feedback.maintainer.map((comment: Comment) => comment.id), ["m1"]);
  assert.ok(h.sent[0].message.content.includes(long));
  assert.deepEqual(h.sent[0].options, { deliverAs: "followUp", triggerTurn: true });
  const persisted = h.events.indexOf("persist:finished");
  const cleanup = h.events.indexOf("cleanup:w:tab-1:w:pane-1:/tmp/private-tuicr");
  const delivered = h.events.indexOf("deliver");
  assert.ok(persisted < cleanup && cleanup < delivered);
  assert.deepEqual(Object.keys(finished).sort(), ["delivered", "feedback", "ownerSessionId", "state", "targetKey"]);
});

test("nonzero exit and manual closure produce clear finished feedback", async () => {
  for (const mode of ["exit", "closed"] as const) {
    const h = harness();
    await h.runtime.restore(h.context);
    await h.runtime.ensure({ target: { kind: "workingTree" } }, h.context);
    if (mode === "exit") h.setExit(7);
    else h.setExists(false);
    h.tick();
    await settle();
    const feedback = h.sent[0].message.details;
    assert.equal(feedback.status, mode === "exit" ? "failed" : "cancelled");
    assert.match(feedback.message, mode === "exit" ? /status 7/ : /tab closed/);
  }
});

test("restores a ready active review and an undelivered finished review", async () => {
  const activeHarness = harness();
  const review = baseReview();
  review.accepted[JSON.stringify({ kind: "line", file: "src/a.ts", line: 4, side: "new", content: "Explain this" })] = "p1";
  activeHarness.branch.push({ type: "custom", customType: STATE_ENTRY, data: {
    state: "active", ownerSessionId: "pi-session", review,
  } });
  await activeHarness.runtime.restore(activeHarness.context);
  const reused = await activeHarness.runtime.ensure(lineRequest(), activeHarness.context);
  assert.equal(reused.reused, true);
  assert.equal(activeHarness.launchCount(), 0);
  assert.equal(activeHarness.added.length, 0);
  activeHarness.runtime.shutdown();

  const finishedHarness = harness();
  finishedHarness.branch.push({ type: "custom", customType: STATE_ENTRY, data: {
    state: "finished", ownerSessionId: "pi-session", targetKey: "target", delivered: false,
    feedback: { status: "completed", sessionId: "exact", seeded: [], maintainer: [{ id: "m", content: "ready" }] },
  } });
  await finishedHarness.runtime.restore(finishedHarness.context);
  assert.equal(finishedHarness.sent.length, 1);
  assert.match(finishedHarness.sent[0].message.content, /ready/);
  assert.equal(finishedHarness.branch.at(-1).data.delivered, true);
});

test("launch cancellation leaves no persisted review, while shutdown preserves a ready review", async () => {
  const failed = harness();
  await failed.runtime.restore(failed.context);
  failed.setLaunchError(new Error("launch cancelled"));
  await assert.rejects(failed.runtime.ensure(lineRequest(), failed.context), /launch cancelled/);
  assert.equal(failed.branch.length, 0);

  const ready = harness();
  await ready.runtime.restore(ready.context);
  await ready.runtime.ensure(lineRequest(), ready.context);
  ready.runtime.shutdown();
  ready.tick();
  await settle();
  assert.ok(ready.branch.some((entry) => entry.data.state === "active"));
  assert.equal(ready.events.some((event) => event.startsWith("cleanup:")), false);
  assert.equal(ready.sent.length, 0);

  const navigated = {
    ...ready.context,
    sessionManager: { getSessionId: () => "another-session", getBranch: () => [] },
  } as any;
  await ready.runtime.restore(navigated);
  const reused = await ready.runtime.ensure(lineRequest(), navigated);
  assert.equal(reused.reused, true, "the active review follows the running extension process");
  assert.equal(ready.launchCount(), 1);
  ready.runtime.shutdown();
});
