import assert from "node:assert/strict";
import test from "node:test";
import { COORDINATOR_AUTHOR, STATE_ENTRY, completionFilePath, type PersistedState, type StoredComment } from "./logic.ts";
import { TuicrReviewRuntime, type ReviewBackend } from "./runtime.ts";

const resources = { workspaceId: "w1", tabId: "w1:t9", paneId: "w1:p9" };
const session = { slug: "repo@main/worktree", path: "/reviews/exact.json", active: true };

function harness(options: {
  launchError?: Error;
  addFailure?: (payload: Record<string, unknown>) => boolean;
  commentFailures?: number;
} = {}) {
  const branch: unknown[] = [];
  const messages: any[] = [];
  const widgets: any[] = [];
  const closes: typeof resources[] = [];
  const additions: Record<string, unknown>[] = [];
  const waits: Array<() => void> = [];
  let comments: StoredComment[] = [];
  let exists = true;
  let exitCode: number | undefined;
  let listCount = 0;
  let completionReads = 0;
  let resourceChecks = 0;
  let preflights = 0;
  let creates = 0;
  let commentFailures = options.commentFailures ?? 0;
  const backend: ReviewBackend = {
    async preflight() { preflights += 1; return { workspaceId: resources.workspaceId }; },
    async listSessions() { return listCount++ === 0 ? [] : [session]; },
    async createTab() { creates += 1; return resources; },
    async launch() { if (options.launchError) throw options.launchError; },
    async comments() { if (commentFailures-- > 0) throw new Error("comments unavailable"); return comments; },
    async add(_cwd, _session, payload) {
      additions.push(payload);
      if (options.addFailure?.(payload)) throw new Error("anchor rejected");
      const comment: StoredComment = {
        id: `c${comments.length + 1}`,
        author: String(payload.username),
        content: String(payload.content),
        ...(typeof payload.file === "string" ? { path: payload.file } : {}),
        ...(typeof payload.line === "number" ? { start_line: payload.line, end_line: payload.line } : {}),
        ...(typeof payload.start_line === "number" ? { start_line: payload.start_line } : {}),
        ...(typeof payload.end_line === "number" ? { end_line: payload.end_line } : {}),
        ...(payload.side === "old" || payload.side === "new" ? { side: payload.side } : {}),
        ...(typeof payload.type === "string" ? { comment_type: payload.type } : { comment_type: "none" }),
      };
      comments = [...comments, comment];
      return comment;
    },
    async completion() { completionReads += 1; return exitCode; },
    async resourceExists() { resourceChecks += 1; return exists; },
    async closeTab(identity) { closes.push(identity); exists = false; },
    async removeCompletionFile() {},
    delay() { return new Promise<void>((resolve) => waits.push(resolve)); },
    completionFile(ownerSessionId) { return completionFilePath(ownerSessionId, "123e4567-e89b-42d3-a456-426614174000"); },
  };
  const pi = {
    appendEntry(customType: string, data: unknown) { branch.push({ type: "custom", customType, data }); },
    sendMessage(message: unknown, delivery: unknown) { messages.push({ message, delivery }); },
  };
  const context = {
    cwd: "/repo",
    hasUI: true,
    sessionManager: { getSessionId: () => "pi-session", getBranch: () => branch },
    ui: {
      theme: { fg: (_color: string, value: string) => value },
      setWidget: (...args: unknown[]) => widgets.push(args),
    },
  } as any;
  const runtime = new TuicrReviewRuntime(pi as any, backend);
  return {
    runtime, backend, context, branch, messages, widgets, closes, additions,
    setComments(value: StoredComment[]) { comments = value; },
    failComments(count = 1) { commentFailures = count; },
    setExists(value: boolean) { exists = value; },
    setExit(value: number | undefined) { exitCode = value; },
    effects() { return { completionReads, resourceChecks, preflights, creates }; },
    tick() { waits.splice(0).forEach((resolve) => resolve()); },
  };
}

const request = {
  target: { kind: "workingTree" as const },
  annotations: [
    { kind: "line" as const, file: "src/a.ts", line: 4, content: "Fix this" },
  ],
};

async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

test("opens once, persists exact ownership, seeds annotations, and reuses without duplicates", async () => {
  const h = harness();
  await h.runtime.restore(h.context);
  const opened = await h.runtime.ensure(request, h.context);
  assert.equal(opened.reused, false);
  assert.deepEqual(opened.acceptedCommentIds, ["c1"]);
  assert.equal(h.additions.length, 1);
  const active = (h.branch.at(-1) as any).data as PersistedState;
  assert.deepEqual(active.resources, resources);
  assert.deepEqual(active.tuicrSession, { slug: session.slug, path: session.path });
  assert.equal(active.status, "active");
  assert.equal((h.branch.at(-1) as any).customType, STATE_ENTRY);

  const reused = await h.runtime.ensure(request, h.context);
  assert.equal(reused.reused, true);
  assert.deepEqual(reused.acceptedCommentIds, ["c1"]);
  assert.equal(h.additions.length, 1, "accepted exact annotation must not be duplicated");
  assert.ok(h.widgets.some((entry) => String(entry[1]).includes("Review open")));
  h.runtime.stop();
});

test("initial completion monitoring waits for delayed seeding and classifies its accepted ID", async () => {
  const h = harness();
  let releaseSeed!: () => void;
  const seedGate = new Promise<void>((resolve) => { releaseSeed = resolve; });
  h.backend.add = async () => {
    await seedGate;
    const comment: StoredComment = {
      id: "c1", author: COORDINATOR_AUTHOR, content: "Fix this",
      path: "src/a.ts", start_line: 4, end_line: 4, side: "new",
    };
    h.setComments([comment]);
    return comment;
  };
  h.setExit(0);
  await h.runtime.restore(h.context);

  const ensuring = h.runtime.ensure(request, h.context);
  await settle();
  assert.equal(h.effects().completionReads, 0, "completion must not be read while initial seeding is pending");

  releaseSeed();
  const opened = await ensuring;
  assert.deepEqual(opened.acceptedCommentIds, ["c1"]);
  await settle();
  assert.equal(h.effects().completionReads, 1);
  assert.equal(h.messages.length, 1);
  assert.deepEqual(h.messages[0].message.details.seeded.map((comment: StoredComment) => comment.id), ["c1"]);
  assert.deepEqual(h.messages[0].message.details.maintainer, []);
  h.runtime.stop();
});

test("retries failed annotations and accepts a revised annotation", async () => {
  let failures = 0;
  const h = harness({ addFailure: () => failures++ === 0 });
  await h.runtime.restore(h.context);
  const first = await h.runtime.ensure(request, h.context);
  assert.equal(first.failures.length, 1);
  assert.deepEqual(first.acceptedCommentIds, []);
  const retry = await h.runtime.ensure(request, h.context);
  assert.deepEqual(retry.acceptedCommentIds, ["c1"]);
  const revised = await h.runtime.ensure({
    ...request,
    annotations: [{ ...request.annotations[0], content: "Fix this differently" }],
  }, h.context);
  assert.deepEqual(revised.acceptedCommentIds, ["c1", "c2"]);
  assert.equal(h.additions.length, 3);
  h.runtime.stop();
});

test("rejects a different target while the exact review is active", async () => {
  const h = harness();
  await h.runtime.restore(h.context);
  await h.runtime.ensure(request, h.context);
  await assert.rejects(h.runtime.ensure({
    target: { kind: "revisions", revset: "main..HEAD" },
  }, h.context), /different Tuicr review/);
  h.runtime.stop();
});

test("launch failure closes only the proven newly owned tab", async () => {
  const h = harness({ launchError: new Error("launch failed") });
  await h.runtime.restore(h.context);
  await assert.rejects(h.runtime.ensure(request, h.context), /launch failed/);
  assert.deepEqual(h.closes, [resources]);
  assert.equal(h.messages.length, 0);
  h.runtime.stop();
});

test("discovery failure closes the exact newly owned tab, but uncertain ownership is preserved", async () => {
  const failedDiscovery = harness();
  failedDiscovery.backend.listSessions = async () => [];
  failedDiscovery.backend.delay = async () => {};
  await failedDiscovery.runtime.restore(failedDiscovery.context);
  await assert.rejects(failedDiscovery.runtime.ensure(request, failedDiscovery.context), /newly active Tuicr session/);
  assert.deepEqual(failedDiscovery.closes, [resources]);
  failedDiscovery.runtime.stop();

  const uncertain = harness({ launchError: new Error("launch failed") });
  uncertain.backend.resourceExists = async () => { throw new Error("Herdr unavailable"); };
  await uncertain.runtime.restore(uncertain.context);
  await assert.rejects(
    uncertain.runtime.ensure(request, uncertain.context),
    /could not be proven closed.*recovery is blocked/,
  );
  assert.equal(uncertain.closes.length, 0);
  assert.equal((uncertain.branch.at(-1) as any).data.status, "recovery-blocked");
  uncertain.runtime.stop();
  await uncertain.runtime.restore(uncertain.context);
  await assert.rejects(uncertain.runtime.ensure(request, uncertain.context), /recovery is blocked/i);
  assert.equal(uncertain.effects().creates, 1, "reload must not create another review");
  uncertain.runtime.stop();
});

test("launch cleanup uses a fresh signal when the tool signal is already aborted", async () => {
  const h = harness({ launchError: new Error("aborted launch") });
  const toolAbort = new AbortController();
  toolAbort.abort(new Error("tool aborted"));
  let cleanupSignal: AbortSignal | undefined;
  h.backend.resourceExists = async (_identity, signal) => {
    cleanupSignal = signal;
    return true;
  };
  await h.runtime.restore(h.context);
  await assert.rejects(h.runtime.ensure(request, h.context, toolAbort.signal), /aborted launch/);
  assert.notEqual(cleanupSignal, toolAbort.signal);
  assert.equal(cleanupSignal?.aborted, false);
  assert.deepEqual(h.closes, [resources]);
  h.runtime.stop();
});

test("seed failure after active persistence still starts completion monitoring", async () => {
  const h = harness({ commentFailures: 1 });
  h.backend.completion = async () => 0;
  await h.runtime.restore(h.context);
  await assert.rejects(h.runtime.ensure(request, h.context), /comments unavailable/);
  await settle();
  const final = (h.branch.at(-1) as any).data as PersistedState;
  assert.equal(final.status, "completed");
  assert.equal(h.messages.length, 1);
  assert.deepEqual(h.closes, [resources]);
  h.runtime.stop();
});

test("monitoring uncertainty is durable across reload and blocks another review", async () => {
  const h = harness();
  h.backend.completion = async () => { throw new Error("filesystem uncertain"); };
  h.backend.delay = async () => {};
  await h.runtime.restore(h.context);
  await h.runtime.ensure(request, h.context);
  await settle();
  assert.equal((h.branch.at(-1) as any).data.status, "recovery-blocked");
  assert.equal(h.messages.length, 0, "uncertain monitoring is not a known failed completion");
  h.runtime.stop();
  await h.runtime.restore(h.context);
  await assert.rejects(h.runtime.ensure(request, h.context), /recovery is blocked.*filesystem uncertain/i);
  assert.equal(h.effects().creates, 1);
  h.runtime.stop();
});

test("normal exit with an unreadable exact session blocks recovery instead of completing", async () => {
  const h = harness();
  await h.runtime.restore(h.context);
  await h.runtime.ensure(request, h.context);
  h.failComments();
  h.setExit(0);
  h.tick();
  await settle();
  assert.equal((h.branch.at(-1) as any).data.status, "recovery-blocked");
  assert.equal(h.messages.length, 0);
  assert.equal(h.closes.length, 0);
  h.runtime.stop();
});

test("normal exit reads exact session, persists before one follow-up delivery, and closes owned tab", async () => {
  const h = harness();
  await h.runtime.restore(h.context);
  await h.runtime.ensure(request, h.context);
  h.setComments([
    { id: "c1", author: COORDINATOR_AUTHOR, content: "Fix this", path: "src/a.ts", start_line: 4, end_line: 4, side: "new" },
    { id: "m1", author: "Maintainer", content: "Looks good", location: "review" },
  ]);
  h.setExit(0);
  h.tick();
  await settle();
  const final = (h.branch.at(-1) as any).data as PersistedState;
  assert.equal(final.status, "completed");
  assert.equal(final.delivered, true);
  assert.deepEqual(h.closes, [resources]);
  assert.equal(h.messages.length, 1);
  assert.deepEqual(h.messages[0].delivery, { deliverAs: "followUp", triggerTurn: true });
  assert.match(h.messages[0].message.content, /Seeded Coordinator comments \(1\)/);
  assert.match(h.messages[0].message.content, /Maintainer comments \(1\)/);
  assert.match(h.messages[0].message.content, /not Human sign-off/);
  assert.equal(h.widgets.at(-1)?.[1], undefined);
  h.runtime.stop();
});

test("reload restores active identity but suppresses already delivered completion", async () => {
  const h = harness();
  const completed: PersistedState = {
    version: 1, ownerSessionId: "pi-session", status: "completed", targetKey: "x", cwd: "/repo",
    resources, tuicrSession: { slug: session.slug, path: session.path },
    completionFile: completionFilePath("pi-session", "123e4567-e89b-42d3-a456-426614174000"), accepted: [], delivered: true,
  };
  h.branch.push({ type: "custom", customType: STATE_ENTRY, data: completed });
  await h.runtime.restore(h.context);
  await settle();
  assert.equal(h.messages.length, 0);
  assert.equal(h.closes.length, 0);
  h.runtime.stop();
});

test("completion preserves multiline, long, and more than 50 comments in model-visible feedback", async () => {
  const h = harness();
  await h.runtime.restore(h.context);
  await h.runtime.ensure(request, h.context);
  const longMultiline = `first line\n${"x".repeat(800)}\nlast line`;
  const maintainers = Array.from({ length: 55 }, (_, index): StoredComment => ({
    id: `m${index + 1}`, author: "Maintainer", content: index === 0 ? longMultiline : `feedback ${index + 1}`,
    location: "review",
  }));
  h.setComments([
    { id: "c1", author: COORDINATOR_AUTHOR, content: "seeded\nfull text", location: "review" },
    ...maintainers,
  ]);
  h.setExit(0);
  h.tick();
  await settle();
  const completion = h.messages[0].message;
  assert.ok(completion.content.includes("seeded\nfull text"));
  assert.ok(completion.content.includes(longMultiline));
  assert.ok(completion.content.includes("feedback 55"));
  assert.equal(completion.details.seeded.length, 1);
  assert.equal(completion.details.maintainer.length, 55);
  h.runtime.stop();
});

test("malformed restored ownership state causes no monitoring or cleanup effects", async () => {
  const h = harness();
  h.branch.push({
    type: "custom", customType: STATE_ENTRY,
    data: {
      version: 1, ownerSessionId: "pi-session", status: "active", targetKey: "x", cwd: "/repo",
      resources, tuicrSession: { slug: session.slug, path: session.path },
      completionFile: "/tmp/not-owned.exit", accepted: [], delivered: false,
    },
  });
  await h.runtime.restore(h.context);
  await settle();
  assert.deepEqual(h.effects(), { completionReads: 0, resourceChecks: 0, preflights: 0, creates: 0 });
  await assert.rejects(h.runtime.ensure(request, h.context), /recovery is blocked.*malformed/i);
  assert.equal(h.effects().creates, 0, "malformed latest state must block new review effects");
  assert.ok(h.widgets.some((entry) => String(entry[1]).includes("Review recovery blocked")));
  assert.equal(h.closes.length, 0);
  assert.equal(h.messages.length, 0);
  h.runtime.stop();
});

test("nonzero exit and manual resource closure produce bounded failed/cancelled completion", async () => {
  for (const mode of ["nonzero", "closed"] as const) {
    const h = harness();
    await h.runtime.restore(h.context);
    await h.runtime.ensure(request, h.context);
    if (mode === "nonzero") h.setExit(7);
    else h.setExists(false);
    h.tick();
    await settle();
    const final = (h.branch.at(-1) as any).data as PersistedState;
    assert.equal(final.status, mode === "nonzero" ? "failed" : "cancelled");
    assert.equal(h.messages.length, 1);
    assert.equal(h.closes.length, 0);
    h.runtime.stop();
  }
});
