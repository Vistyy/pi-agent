import assert from "node:assert/strict";
import test from "node:test";
import { COORDINATOR_AUTHOR, STATE_ENTRY, completionFilePath, dataDirectoryPath, type PersistedState, type StoredComment } from "./logic.ts";
import { TuicrReviewRuntime, type ReviewBackend } from "./runtime.ts";

const resources = { workspaceId: "w1", tabId: "w1:t9", paneId: "w1:p9" };
const dataDir = dataDirectoryPath("pi-session", "123e4567-e89b-42d3-a456-426614174001");
const session = { slug: "repo@main/worktree", path: `${dataDir}/tuicr/reviews/exact.json`, active: true };

function harness(options: {
  launchError?: Error;
  closeError?: Error;
  removeDataError?: Error;
  sendError?: Error;
  deferDelivery?: boolean;
  addFailure?: (payload: Record<string, unknown>) => boolean;
  commentFailures?: number;
} = {}) {
  const branch: unknown[] = [];
  const messages: any[] = [];
  const widgets: any[] = [];
  const closes: typeof resources[] = [];
  const additions: Record<string, unknown>[] = [];
  const removedCompletionFiles: string[] = [];
  const removedDataDirs: string[] = [];
  const reviewDataDirs: string[] = [];
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
    async createDataDirectory() { return dataDir; },
    async listSessions(_cwd, ownedDataDir) { reviewDataDirs.push(ownedDataDir); return listCount++ === 0 ? [] : [session]; },
    async createTab(_cwd, _workspace, ownedDataDir) { creates += 1; reviewDataDirs.push(ownedDataDir); return resources; },
    async launch() { if (options.launchError) throw options.launchError; },
    async comments(_cwd, ownedDataDir) { reviewDataDirs.push(ownedDataDir); if (commentFailures-- > 0) throw new Error("comments unavailable"); return comments; },
    async add(_cwd, ownedDataDir, _session, payload) {
      reviewDataDirs.push(ownedDataDir);
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
    async closeTab(identity) { if (options.closeError) throw options.closeError; closes.push(identity); exists = false; },
    async removeCompletionFile(path) { removedCompletionFiles.push(path); },
    async removeDataDirectory(path) { if (options.removeDataError) throw options.removeDataError; removedDataDirs.push(path); },
    delay() { return new Promise<void>((resolve) => waits.push(resolve)); },
    completionFile(ownerSessionId) { return completionFilePath(ownerSessionId, "123e4567-e89b-42d3-a456-426614174000"); },
  };
  const pi = {
    appendEntry(customType: string, data: unknown) { branch.push({ type: "custom", customType, data }); },
    sendMessage(message: any, delivery: unknown) {
      messages.push({ message, delivery });
      if (!options.deferDelivery) branch.push({ type: "custom_message", ...message });
      if (options.sendError) throw options.sendError;
    },
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
    runtime, backend, context, branch, messages, widgets, closes, additions, removedCompletionFiles, removedDataDirs, reviewDataDirs,
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
  assert.equal(active.dataDir, dataDir);
  assert.ok(h.reviewDataDirs.length >= 4);
  assert.ok(h.reviewDataDirs.every((path) => path === dataDir), "all Tuicr review operations must use the private data directory");
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
    /could not be proven cleaned.*recovery is blocked/,
  );
  assert.equal(uncertain.closes.length, 0);
  assert.equal((uncertain.branch.at(-1) as any).data.status, "recovery-blocked");
  uncertain.runtime.stop();
  await uncertain.runtime.restore(uncertain.context);
  await assert.rejects(uncertain.runtime.ensure(request, uncertain.context), /recovery is blocked/i);
  assert.equal(uncertain.effects().creates, 1, "reload must not create another review");
  uncertain.runtime.stop();
});

test("never adopts a concurrently discovered session outside the private data directory", async () => {
  const h = harness();
  let calls = 0;
  h.backend.listSessions = async () => calls++ === 0 ? [] : [{ ...session, slug: "external", path: "/shared/tuicr/external.json" }];
  h.backend.delay = async () => {};
  await h.runtime.restore(h.context);
  await assert.rejects(h.runtime.ensure(request, h.context), /outside the exact owned data directory/);
  assert.deepEqual(h.closes, [resources]);
  assert.deepEqual(h.removedDataDirs, [dataDir]);
  h.runtime.stop();
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
  assert.deepEqual((final.notification!.details as any).seeded.map((comment: StoredComment) => comment.id), ["c1"]);
  assert.deepEqual((final.notification!.details as any).maintainer.map((comment: StoredComment) => comment.id), ["m1"]);
  assert.deepEqual(h.closes, [resources]);
  assert.equal(h.messages.length, 1);
  assert.deepEqual(h.messages[0].delivery, { deliverAs: "followUp", triggerTurn: true });
  assert.match(h.messages[0].message.content, /Seeded Coordinator comments \(1\)/);
  assert.match(h.messages[0].message.content, /Maintainer comments \(1\)/);
  assert.match(h.messages[0].message.content, /not Human sign-off/);
  assert.equal(h.widgets.at(-1)?.[1], undefined);
  h.runtime.stop();
});

test("terminal cleanup uncertainty becomes durable recovery-blocked and preserves private storage", async () => {
  for (const exitCode of [0, 9]) {
    const h = harness({ closeError: new Error("Herdr close uncertain") });
    await h.runtime.restore(h.context);
    await h.runtime.ensure(request, h.context);
    h.setExit(exitCode);
    h.tick();
    await settle();
    const blocked = (h.branch.filter((entry: any) => entry.customType === STATE_ENTRY).at(-1) as any).data;
    assert.equal(blocked.status, "recovery-blocked");
    assert.match(blocked.reason, /Terminal review cleanup is uncertain/);
    assert.equal(blocked.notification.details.status, exitCode === 0 ? "completed" : "failed");
    assert.equal(h.messages.length, 0);
    assert.deepEqual(h.removedDataDirs, []);
    await assert.rejects(h.runtime.ensure(request, h.context), /recovery is blocked/i);
    h.runtime.stop();
  }
});

test("same-review cancellation returns before queued follow-up delivery and confirms asynchronously", async () => {
  const h = harness({ deferDelivery: true });
  h.backend.completion = () => new Promise(() => {});
  await h.runtime.restore(h.context);
  await h.runtime.ensure(request, h.context);
  h.setExists(false);

  let outcome: "resolved" | "rejected" | undefined;
  const ensuring = h.runtime.ensure(request, h.context).then(
    () => "resolved" as const,
    () => "rejected" as const,
  );
  void ensuring.then((value) => { outcome = value; });
  await settle();
  assert.equal(outcome, "rejected", "tool execution must settle before Pi appends its queued follow-up");
  const pending = (h.branch.filter((entry: any) => entry.customType === STATE_ENTRY).at(-1) as any).data as PersistedState;
  assert.equal(pending.status, "cancelled");
  assert.equal(pending.delivered, false);
  assert.equal(h.messages.length, 1);

  h.branch.push({ type: "custom_message", ...h.messages[0].message });
  h.tick();
  await settle();
  const delivered = (h.branch.filter((entry: any) => entry.customType === STATE_ENTRY).at(-1) as any).data as PersistedState;
  assert.equal(delivered.delivered, true);
  h.runtime.stop();
});

test("marks delivery complete only after the queued custom message is appended", async () => {
  const h = harness({ deferDelivery: true });
  await h.runtime.restore(h.context);
  await h.runtime.ensure(request, h.context);
  h.setExit(0);
  h.tick();
  await settle();
  const pending = (h.branch.filter((entry: any) => entry.customType === STATE_ENTRY).at(-1) as any).data as PersistedState;
  assert.equal(pending.delivered, false);
  assert.equal(h.messages.length, 1);

  h.branch.push({ type: "custom_message", ...h.messages[0].message });
  h.tick();
  await settle();
  const delivered = (h.branch.filter((entry: any) => entry.customType === STATE_ENTRY).at(-1) as any).data as PersistedState;
  assert.equal(delivered.delivered, true);
  h.runtime.stop();
});

test("reload completes an interrupted pending delivery exactly once", async () => {
  const h = harness({ sendError: new Error("crash after append") });
  await h.runtime.restore(h.context);
  await h.runtime.ensure(request, h.context);
  h.setExit(0);
  h.tick();
  await settle();
  const pending = (h.branch.filter((entry: any) => entry.customType === STATE_ENTRY).at(-1) as any).data as PersistedState;
  assert.equal(pending.delivered, false);
  assert.equal(h.messages.length, 1);
  assert.ok(h.branch.some((entry: any) => entry.type === "custom_message" && entry.details.deliveryId === pending.notification!.deliveryId));

  h.runtime.stop();
  await h.runtime.restore(h.context);
  await settle();
  const delivered = (h.branch.filter((entry: any) => entry.customType === STATE_ENTRY).at(-1) as any).data as PersistedState;
  assert.equal(delivered.delivered, true);
  assert.equal(h.messages.length, 1, "matching already-appended completion must not be duplicated");
  h.runtime.stop();
});

test("reload retries a terminal notification that was persisted before send", async () => {
  const h = harness();
  const deliveryId = "123e4567-e89b-42d3-a456-426614174003";
  const pending: PersistedState = {
    version: 1, ownerSessionId: "pi-session", status: "failed", targetKey: "x", cwd: "/repo",
    resources, tuicrSession: { slug: session.slug, path: session.path },
    completionFile: completionFilePath("pi-session", "123e4567-e89b-42d3-a456-426614174000"), dataDir,
    accepted: [], notification: { deliveryId, content: "Tuicr failed", details: { status: "failed", deliveryId } }, delivered: false,
  };
  h.branch.push({ type: "custom", customType: STATE_ENTRY, data: pending });
  h.setExists(false);
  await h.runtime.restore(h.context);
  await settle();
  assert.equal(h.messages.length, 1);
  assert.equal(h.messages[0].message.details.deliveryId, deliveryId);
  assert.equal((h.branch.at(-1) as any).data.delivered, true);
  assert.deepEqual(h.removedDataDirs, [dataDir]);
  h.runtime.stop();
});

test("reload restores active identity but suppresses already delivered completion", async () => {
  const h = harness();
  const completed: PersistedState = {
    version: 1, ownerSessionId: "pi-session", status: "completed", targetKey: "x", cwd: "/repo",
    resources, tuicrSession: { slug: session.slug, path: session.path },
    completionFile: completionFilePath("pi-session", "123e4567-e89b-42d3-a456-426614174000"), dataDir,
    accepted: [], notification: {
      deliveryId: "123e4567-e89b-42d3-a456-426614174002", content: "done", details: { deliveryId: "123e4567-e89b-42d3-a456-426614174002" },
    }, delivered: true,
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
      completionFile: "/tmp/not-owned.exit", dataDir, accepted: [], notification: null, delivered: false,
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

test("active and terminal-delivery-pending reviews block navigation, but recovery-blocked does not", async () => {
  const active = harness({ deferDelivery: true });
  await active.runtime.restore(active.context);
  await active.runtime.ensure(request, active.context);
  assert.match(active.runtime.navigationBlockReason() ?? "", /Finish it or manually close/);

  active.setExit(9);
  active.tick();
  await settle();
  assert.match(active.runtime.navigationBlockReason() ?? "", /completion is still being delivered/);
  active.runtime.stop();

  const blocked = harness({ closeError: new Error("Herdr unavailable") });
  await blocked.runtime.restore(blocked.context);
  await blocked.runtime.ensure(request, blocked.context);
  blocked.setExit(9);
  blocked.tick();
  await settle();
  assert.equal((blocked.branch.at(-1) as any).data.status, "recovery-blocked");
  assert.equal(blocked.runtime.navigationBlockReason(), undefined);
  blocked.runtime.stop();
});

test("reload shutdown preserves the active review for the replacement runtime", async () => {
  const h = harness();
  await h.runtime.restore(h.context);
  await h.runtime.ensure(request, h.context);
  const persistedBeforeReload = h.branch.length;

  await h.runtime.shutdown("reload");

  assert.deepEqual(h.closes, []);
  assert.deepEqual(h.removedCompletionFiles, []);
  assert.deepEqual(h.removedDataDirs, []);
  assert.equal(h.branch.length, persistedBeforeReload);

  const replacement = new TuicrReviewRuntime({
    appendEntry: (customType: string, data: unknown) => h.branch.push({ type: "custom", customType, data }),
    sendMessage: () => {},
  } as any, h.backend);
  await replacement.restore(h.context);
  assert.match(replacement.navigationBlockReason() ?? "", /Tuicr review is open/);
  replacement.stop();
});

test("quit shutdown cleans exact owned resources and persists cancellation for later delivery", async () => {
  const h = harness();
  await h.runtime.restore(h.context);
  await h.runtime.ensure(request, h.context);

  await h.runtime.shutdown("quit");
  await h.runtime.shutdown("quit");

  assert.deepEqual(h.closes, [resources]);
  assert.equal(h.removedCompletionFiles.length, 1);
  assert.deepEqual(h.removedDataDirs, [dataDir]);
  const cancelled = (h.branch.at(-1) as any).data as PersistedState;
  assert.equal(cancelled.status, "cancelled");
  assert.equal(cancelled.delivered, false);
  assert.equal((cancelled.notification!.details as any).reason, "session-quit");
  assert.equal(h.messages.length, 0, "shutdown must defer notification to a later resume");

  await h.runtime.restore(h.context);
  await settle();
  assert.equal(h.messages.length, 1);
  assert.match(h.messages[0].message.content, /not Human sign-off/);
  h.runtime.stop();
});

test("uncertain shutdown cleanup preserves recovery-blocked identity and does not continue cleanup", async () => {
  const h = harness({ closeError: new Error("close timed out") });
  await h.runtime.restore(h.context);
  await h.runtime.ensure(request, h.context);

  await h.runtime.shutdown("new");

  const blocked = (h.branch.at(-1) as any).data;
  assert.equal(blocked.status, "recovery-blocked");
  assert.deepEqual(blocked.resources, resources);
  assert.equal(blocked.dataDir, dataDir);
  assert.match(blocked.reason, /Session shutdown cleanup is uncertain.*close timed out/);
  assert.deepEqual(h.removedCompletionFiles, []);
  assert.deepEqual(h.removedDataDirs, []);
  assert.equal(h.messages.length, 0);
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
    assert.equal(h.closes.length, mode === "nonzero" ? 1 : 0);
    assert.deepEqual(h.removedDataDirs, [dataDir]);
    h.runtime.stop();
  }
});
