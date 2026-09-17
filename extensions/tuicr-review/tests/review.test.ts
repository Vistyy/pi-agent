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
  dataHome: "/tmp/pi-tuicr-review-pi-session-owned",
  completionFile: "/tmp/pi-tuicr-review-pi-session-owned/exit",
  accepted: {},
});

function harness() {
  let branch: any[] = [];
  let sessionId = "pi-session";
  const events: string[] = [];
  const sent: any[] = [];
  const added: Record<string, unknown>[] = [];
  const sleeps: Array<() => void> = [];
  let launchCount = 0;
  let addFailures = 0;
  let exit: number | undefined;
  let tabExists = true;
  let dataExists = true;
  let comments: Comment[] = [];
  let commentsFailures = 0;
  let persistFailure = false;
  const ops = {
    async launch(request: any) {
      launchCount += 1;
      return { ...baseReview(), targetKey: request.targetKey, cwd: request.cwd, accepted: {} };
    },
    async add(_review: OwnedReview, payload: Record<string, unknown>) {
      added.push(payload);
      if (addFailures-- > 0) throw new Error("anchor rejected");
      const id = `p${added.length}`;
      comments.push({
        id, content: String(payload.content), author: "Pi",
        ...(payload.file ? { path: String(payload.file) } : {}),
        ...(payload.line ? { start_line: Number(payload.line), end_line: Number(payload.line), side: payload.side as "old" | "new" } : {}),
        ...(payload.start_line ? { start_line: Number(payload.start_line), end_line: Number(payload.end_line), side: payload.side as "old" | "new" } : {}),
      });
      return id;
    },
    async comments() {
      if (commentsFailures-- > 0) throw new Error("comments unavailable");
      return comments;
    },
    async completion() { return exit; },
    async tabExists() { return tabExists; },
    async dataExists() { return dataExists; },
    async cleanup(review: OwnedReview) { events.push(`cleanup:${review.tabId}:${review.dataHome}`); dataExists = false; tabExists = false; return []; },
    sleep(milliseconds: number) {
      if (milliseconds === 25) return Promise.resolve();
      return new Promise<void>((resolve) => sleeps.push(resolve));
    },
  };
  const pi = {
    appendEntry(customType: string, data: PersistedReview) {
      if (persistFailure && data.state === "active" && Object.keys(data.review.accepted).length) throw new Error("crash before persist");
      events.push(`persist:${data.state}`);
      branch.push({ type: "custom", customType, data: structuredClone(data) });
    },
    sendMessage(message: any, options: unknown) { events.push("deliver"); sent.push({ message, options }); },
  };
  const context = () => ({
    cwd: "/repo",
    sessionManager: { getSessionId: () => sessionId, getBranch: () => branch },
  } as any);
  return {
    ops, pi, events, sent, added,
    runtime: () => new GuidedReview(pi as any, ops as any),
    context,
    branch: () => branch,
    replaceBranch(value: any[], owner = sessionId) { branch = value; sessionId = owner; },
    setAddFailures(value: number) { addFailures = value; },
    setExit(value: number | undefined) { exit = value; },
    setTabExists(value: boolean) { tabExists = value; },
    setDataExists(value: boolean) { dataExists = value; },
    setComments(value: Comment[]) { comments = value; },
    setCommentsFailures(value: number) { commentsFailures = value; },
    setPersistFailure(value: boolean) { persistFailure = value; },
    tick() { sleeps.splice(0).forEach((resolve) => resolve()); },
    launchCount: () => launchCount,
  };
}

const lineRequest = (content = "Explain this") => ({
  target: { kind: "workingTree" as const },
  annotations: [{ kind: "line" as const, file: "src/a.ts", line: 4, side: "new" as const, content }],
});
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

test("reconciles an accepted Pi annotation after add succeeded before compact persistence", async () => {
  const h = harness();
  const first = h.runtime();
  await first.restore(h.context());
  h.setPersistFailure(true);
  const interrupted = await first.ensure(lineRequest(), h.context());
  assert.equal(interrupted.failures.length, 1);
  first.shutdown();
  h.setPersistFailure(false);

  const restored = h.runtime();
  await restored.restore(h.context());
  const result = await restored.ensure(lineRequest(), h.context());
  assert.equal(result.reused, true);
  assert.deepEqual(result.acceptedCommentIds, ["p1"]);
  assert.equal(h.added.length, 1, "the accepted exact Pi comment is not added twice");
  restored.shutdown();
});

test("finished feedback replays after queued-message interruption and suppresses repeats in one runtime", async () => {
  const h = harness();
  const first = h.runtime();
  await first.restore(h.context());
  await first.ensure({ target: { kind: "workingTree" } }, h.context());
  h.setExit(0);
  await settle();
  h.tick();
  await settle();
  assert.equal(h.sent.length, 1);
  const deliveryId = h.sent[0].message.details.deliveryId;
  assert.ok(deliveryId);

  const second = h.runtime();
  await second.restore(h.context());
  assert.equal(h.sent.length, 2, "sendMessage alone is not delivery confirmation");
  await second.restore(h.context());
  assert.equal(h.sent.length, 2, "one live runtime sends an identity only once");

  h.branch().push({ type: "custom_message", customType: "tuicr-review-feedback", details: { deliveryId } });
  const third = h.runtime();
  await third.restore(h.context());
  assert.equal(h.sent.length, 2, "the exact message already on the branch is not replayed");
});

test("tree navigation preserves current review and clears a stale old active branch silently", async () => {
  const h = harness();
  const runtime = h.runtime();
  await runtime.restore(h.context());
  await runtime.ensure(lineRequest(), h.context());
  const stale = structuredClone(h.branch()[0]);
  h.replaceBranch([], "pi-session");
  await runtime.tree(h.context());
  assert.equal(h.branch().at(-1).data.state, "active", "current state is persisted into the visible branch");
  const reused = await runtime.ensure(lineRequest(), h.context());
  assert.equal(reused.reused, true);

  h.setExit(0);
  await settle();
  h.tick();
  await settle();
  const sentBeforeStaleNavigation = h.sent.length;
  h.replaceBranch([stale], "pi-session");
  await runtime.tree(h.context());
  assert.equal(h.branch().at(-1).data.state, "finished", "stale branch state cannot replace current finished state");
  assert.equal(h.sent.length, sentBeforeStaleNavigation);
  runtime.shutdown();

  h.replaceBranch([stale], "pi-session");
  h.setExit(undefined);
  h.setTabExists(false);
  h.setDataExists(false);
  const restored = h.runtime();
  await restored.restore(h.context());
  assert.equal(h.sent.length, sentBeforeStaleNavigation, "ordinary stale cleanup does not emit contradictory feedback");
  assert.equal(h.branch().at(-1).data.state, "cleared");
});

test("same-target reuse checks liveness and preserves data when comments cannot be read", async () => {
  const h = harness();
  const runtime = h.runtime();
  await runtime.restore(h.context());
  await runtime.ensure({ target: { kind: "workingTree" } }, h.context());
  h.setTabExists(false);
  h.setCommentsFailures(3);
  await assert.rejects(runtime.ensure({ target: { kind: "workingTree" } }, h.context()), /finished while reuse/);
  assert.equal(h.events.some((event) => event.startsWith("cleanup:")), false);
  assert.match(h.sent.at(-1).message.details.message, /resources were preserved/);
});

test("completion retries transient reads, cleans, and reports exact comments", async () => {
  const h = harness();
  const runtime = h.runtime();
  await runtime.restore(h.context());
  await runtime.ensure(lineRequest(), h.context());
  h.setComments([{ id: "p1", author: "Pi", content: "Explain this", path: "src/a.ts", start_line: 4, end_line: 4, side: "new" }]);
  h.setCommentsFailures(2);
  h.setExit(0);
  await settle();
  h.tick();
  await settle();
  assert.deepEqual(h.sent[0].message.details.seeded.map((comment: Comment) => comment.id), ["p1"]);
  assert.ok(h.events.some((event) => event.startsWith("cleanup:")));
});
