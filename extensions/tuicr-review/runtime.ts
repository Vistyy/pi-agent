import { randomUUID } from "node:crypto";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
  STATE_ENTRY,
  annotationFingerprint,
  annotationPayload,
  commentFingerprint,
  discoverNewActive,
  hasCompletionDelivery,
  isSessionInDataDirectory,
  normalizeRequest,
  restoreState,
  type AcceptedAnnotation,
  type Annotation,
  type CompletionNotification,
  type NormalizedRequest,
  type PersistedState,
  type RecoveryBlockedState,
  type ResourceIdentity,
  type ReviewRequest,
  type SessionSummary,
  type StoredComment,
  type TuicrSessionIdentity,
} from "./logic.ts";

const WIDGET_ID = "tuicr-review";
const DISCOVERY_ATTEMPTS = 40;
const POLL_MS = 250;
const MAX_FAILURES = 8;

export interface ReviewBackend {
  preflight(cwd: string, signal?: AbortSignal): Promise<{ readonly workspaceId: string }>;
  createDataDirectory(ownerSessionId: string): Promise<string>;
  listSessions(cwd: string, dataDir: string, signal?: AbortSignal): Promise<readonly SessionSummary[]>;
  createTab(cwd: string, workspaceId: string, dataDir: string, signal?: AbortSignal): Promise<ResourceIdentity>;
  launch(resources: ResourceIdentity, cwd: string, args: readonly string[], completionFile: string, signal?: AbortSignal): Promise<void>;
  comments(cwd: string, dataDir: string, session: TuicrSessionIdentity, signal?: AbortSignal): Promise<readonly StoredComment[]>;
  add(cwd: string, dataDir: string, session: TuicrSessionIdentity, payload: Record<string, unknown>, signal?: AbortSignal): Promise<StoredComment>;
  completion(completionFile: string): Promise<number | undefined>;
  resourceExists(resources: ResourceIdentity, signal?: AbortSignal): Promise<boolean>;
  closeTab(resources: ResourceIdentity, signal?: AbortSignal): Promise<void>;
  removeCompletionFile(completionFile: string): Promise<void>;
  removeDataDirectory(dataDir: string): Promise<void>;
  delay(milliseconds: number, signal?: AbortSignal): Promise<void>;
  completionFile(ownerSessionId: string): string;
}

export interface EnsureResult {
  readonly reused: boolean;
  readonly session: TuicrSessionIdentity;
  readonly acceptedCommentIds: readonly string[];
  readonly failures: readonly string[];
}

export class TuicrReviewRuntime {
  private state?: PersistedState | RecoveryBlockedState;
  private recoveryError?: string;
  private context?: ExtensionContext;
  private generation = 0;
  private operation: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly pi: Pick<ExtensionAPI, "appendEntry" | "sendMessage">,
    private readonly backend: ReviewBackend,
  ) {}

  async restore(ctx: ExtensionContext): Promise<void> {
    this.generation += 1;
    this.context = ctx;
    const restored = restoreState(ctx.sessionManager.getBranch(), ctx.sessionManager.getSessionId());
    this.state = restored.kind === "known" ? restored.state : undefined;
    this.recoveryError = restored.kind === "malformed" ? restored.reason : undefined;
    this.render();
    if (this.state?.status === "active") this.startWait(this.generation);
    else if (this.state && this.state.status !== "recovery-blocked" && !this.state.delivered) {
      const generation = this.generation;
      void this.enqueue(() => this.resumeTerminal(generation)).catch(() => undefined);
    }
  }

  stop(): void {
    this.generation += 1;
    this.context?.ui.setWidget(WIDGET_ID, undefined);
    this.context = undefined;
    this.state = undefined;
    this.recoveryError = undefined;
  }

  ensure(input: ReviewRequest, ctx: ExtensionContext, signal?: AbortSignal): Promise<EnsureResult> {
    return this.enqueue(async () => {
      this.assertContext(ctx);
      const request = normalizeRequest(ctx.cwd, input);
      if (this.recoveryError) throw new Error(`Tuicr review recovery is blocked. ${this.recoveryError} Resolve the uncertain resource/session with the human before retrying.`);
      if (this.state?.status === "recovery-blocked") {
        throw new Error(`Tuicr review recovery is blocked. ${this.state.reason} Resolve the preserved Herdr resource/Tuicr session with the human before retrying.`);
      }
      if (this.state && this.state.status !== "active" && !this.state.delivered) {
        throw new Error("The previous Tuicr review completion is still being recovered; retry after its notification is delivered.");
      }
      if (this.state?.status === "active") {
        if (this.state.targetKey !== request.targetKey) {
          throw new Error("A different Tuicr review is already active on this conversation branch. Complete or cancel it before opening another target.");
        }
        if (!await this.backend.resourceExists(this.state.resources, signal)) {
          await this.finishKnown("cancelled", "The owned Herdr tab or pane was closed before Tuicr completed.");
          throw new Error("The active Tuicr review was cancelled because its owned Herdr resource was closed.");
        }
        const seeded = await this.seed(request.annotations, signal);
        return { reused: true, session: this.state.tuicrSession, ...seeded };
      }

      const ownerSessionId = ctx.sessionManager.getSessionId();
      const { workspaceId } = await this.backend.preflight(request.cwd, signal);
      const dataDir = await this.backend.createDataDirectory(ownerSessionId);
      let before: readonly SessionSummary[];
      let resources: ResourceIdentity;
      try {
        before = await this.backend.listSessions(request.cwd, dataDir, signal);
        resources = await this.backend.createTab(request.cwd, workspaceId, dataDir, signal);
      } catch (error) {
        try {
          await this.backend.removeDataDirectory(dataDir);
        } catch (cleanupError) {
          throw new Error(`${message(error)} Cleanup of the exact private Tuicr data directory failed: ${singleLine(message(cleanupError))}`);
        }
        throw error;
      }
      return this.launchAndSeed(request, before, resources, dataDir, ownerSessionId, signal);
    });
  }

  private async launchAndSeed(
    request: NormalizedRequest,
    before: readonly SessionSummary[],
    resources: ResourceIdentity,
    dataDir: string,
    ownerSessionId: string,
    signal?: AbortSignal,
  ): Promise<EnsureResult> {
    const completionFile = this.backend.completionFile(ownerSessionId);
    let session: SessionSummary;
    try {
      await this.backend.launch(resources, request.cwd, request.launchArgs, completionFile, signal);
      session = await this.discover(request.cwd, dataDir, before, resources, signal);
    } catch (error) {
      const cleanupSignal = AbortSignal.timeout(10_000);
      try {
        if (await this.backend.resourceExists(resources, cleanupSignal)) await this.backend.closeTab(resources, cleanupSignal);
        await this.backend.removeDataDirectory(dataDir);
      } catch (cleanupError) {
        this.blockRecovery({
          request, resources, completionFile, dataDir, tuicrSession: null,
          reason: `Launch/discovery failed and cleanup of the exact owned resources is uncertain: ${singleLine(message(cleanupError))}`,
        });
        throw new Error(`${message(error)} The newly owned resources could not be proven cleaned; their exact identity was preserved and recovery is blocked.`);
      }
      throw error;
    }

    this.state = {
      version: 1, ownerSessionId, status: "active", targetKey: request.targetKey, cwd: request.cwd,
      resources, tuicrSession: { slug: session.slug, path: session.path }, completionFile, dataDir,
      accepted: [], notification: null, delivered: false,
    };
    this.persist();
    this.render();
    try {
      return { reused: false, session, ...await this.seed(request.annotations, signal) };
    } finally {
      this.startWait(this.generation);
    }
  }

  private async discover(
    cwd: string,
    dataDir: string,
    before: readonly SessionSummary[],
    resources: ResourceIdentity,
    signal?: AbortSignal,
  ): Promise<SessionSummary> {
    let lastError: unknown;
    for (let attempt = 0; attempt < DISCOVERY_ATTEMPTS; attempt += 1) {
      if (!await this.backend.resourceExists(resources, signal)) {
        throw new Error("The newly owned Herdr tab or pane closed before its Tuicr session was discovered.");
      }
      try {
        const session = discoverNewActive(before, await this.backend.listSessions(cwd, dataDir, signal));
        if (!isSessionInDataDirectory(session, dataDir)) {
          throw new Error("The discovered Tuicr session is outside the exact owned data directory.");
        }
        return session;
      } catch (error) {
        lastError = error;
      }
      await this.backend.delay(POLL_MS, signal);
    }
    throw lastError instanceof Error ? lastError : new Error("Could not discover the exact active Tuicr session.");
  }

  private async seed(annotations: readonly Annotation[], signal?: AbortSignal) {
    if (!this.state || this.state.status !== "active") throw new Error("No active Tuicr review.");
    const activeState = this.state;
    const comments = await this.backend.comments(activeState.cwd, activeState.dataDir, activeState.tuicrSession, signal);
    const acceptedByFingerprint = new Map<string, string>();
    for (const comment of comments) {
      const fingerprint = commentFingerprint(comment);
      if (fingerprint) acceptedByFingerprint.set(fingerprint, comment.id);
    }

    const failures: string[] = [];
    for (const annotation of annotations) {
      const fingerprint = annotationFingerprint(annotation);
      if (acceptedByFingerprint.has(fingerprint)) continue;
      try {
        const comment = await this.backend.add(
          activeState.cwd, activeState.dataDir, activeState.tuicrSession, annotationPayload(annotation), signal,
        );
        acceptedByFingerprint.set(fingerprint, comment.id);
      } catch (error) {
        failures.push(`${describe(annotation)}: ${singleLine(message(error))}`);
      }
    }

    const requested = new Set(annotations.map(annotationFingerprint));
    const accepted: AcceptedAnnotation[] = [...acceptedByFingerprint]
      .filter(([fingerprint]) => requested.has(fingerprint) || activeState.accepted.some((item) => item.fingerprint === fingerprint))
      .map(([fingerprint, commentId]) => ({ fingerprint, commentId }));
    if (this.state === activeState) {
      this.state = { ...activeState, accepted };
      this.persist();
      this.render();
    }
    return { acceptedCommentIds: accepted.map((item) => item.commentId), failures: failures.slice(0, 20) };
  }

  private startWait(generation: number): void {
    void this.waitForCompletion(generation).catch((error) => {
      if (this.isCurrent(generation)) this.blockActiveRecovery(`Review monitoring failed with exact ownership preserved: ${singleLine(message(error))}`);
    });
  }

  private async waitForCompletion(generation: number): Promise<void> {
    let failures = 0;
    while (this.isCurrent(generation) && this.state?.status === "active") {
      const state = this.state;
      try {
        const exitCode = await this.backend.completion(state.completionFile);
        if (exitCode !== undefined) {
          if (exitCode !== 0) await this.finishKnown("failed", `Tuicr exited with status ${exitCode}.`);
          else await this.completeNormally(state);
          return;
        }
        if (!await this.backend.resourceExists(state.resources)) {
          await this.finishKnown("cancelled", "The owned Herdr tab or pane was closed before Tuicr completed.");
          return;
        }
        failures = 0;
      } catch (error) {
        failures += 1;
        if (failures >= MAX_FAILURES) throw error;
      }
      await this.backend.delay(POLL_MS);
    }
  }

  private async completeNormally(state: PersistedState): Promise<void> {
    let comments: readonly StoredComment[];
    try {
      comments = await this.backend.comments(state.cwd, state.dataDir, state.tuicrSession);
    } catch (error) {
      this.blockActiveRecovery(`Tuicr exited normally, but its exact persisted session could not be read: ${singleLine(message(error))}`);
      return;
    }
    const seededIds = new Set(state.accepted.map((item) => item.commentId));
    const seeded = comments.filter((comment) => seededIds.has(comment.id));
    const maintainer = comments.filter((comment) => !seededIds.has(comment.id));
    const outcome = [
      `Tuicr review completed for ${state.targetKey}.`,
      `Seeded Coordinator comments (${seeded.length}):${formatComments(seeded)}`,
      `Maintainer comments (${maintainer.length}):${formatComments(maintainer)}`,
      "This feedback is not Human sign-off and does not grant delivery, publication, or repository mutation authority.",
    ].join("\n");
    await this.finishKnown("completed", outcome, { seeded, maintainer });
  }

  private async finishKnown(
    status: "completed" | "failed" | "cancelled",
    content: string,
    comments?: { readonly seeded: readonly StoredComment[]; readonly maintainer: readonly StoredComment[] },
  ): Promise<void> {
    const state = this.state;
    if (!state || state.status !== "active") return;
    const deliveryId = randomUUID();
    const notification: CompletionNotification = {
      deliveryId,
      content,
      details: { status, session: state.tuicrSession, deliveryId, ...comments },
    };
    const terminal: PersistedState = { ...state, status, notification, delivered: false };
    this.state = terminal;
    this.persist();
    this.render();
    await this.cleanupAndDeliver(terminal, this.generation);
  }

  private async resumeTerminal(generation: number): Promise<void> {
    if (!this.isCurrent(generation)) return;
    const state = this.state;
    if (!state || state.status === "active" || state.status === "recovery-blocked" || state.delivered) return;
    await this.cleanupAndDeliver(state, generation);
  }

  private async cleanupAndDeliver(state: PersistedState, generation: number): Promise<void> {
    try {
      if (await this.backend.resourceExists(state.resources)) await this.backend.closeTab(state.resources);
      await this.backend.removeCompletionFile(state.completionFile);
      await this.backend.removeDataDirectory(state.dataDir);
    } catch (error) {
      if (this.state === state) {
        this.state = { ...state, status: "recovery-blocked", reason: `Terminal review cleanup is uncertain; exact resources were preserved: ${singleLine(message(error))}`, delivered: false };
        this.persist();
        this.render();
      }
      return;
    }
    await this.deliver(state, generation);
  }

  private async deliver(state: PersistedState, generation: number): Promise<void> {
    if (!state.notification || this.state !== state) return;
    const ctx = this.context;
    if (!ctx) return;
    if (!hasCompletionDelivery(ctx.sessionManager.getBranch(), state.notification.deliveryId)) {
      this.pi.sendMessage(
        { customType: "tuicr-review-completion", content: state.notification.content, display: true, details: state.notification.details },
        { deliverAs: "followUp", triggerTurn: true },
      );
    }
    while (this.state === state && this.context === ctx && this.isCurrent(generation)) {
      if (hasCompletionDelivery(ctx.sessionManager.getBranch(), state.notification.deliveryId)) {
        this.state = { ...state, delivered: true };
        this.persist();
        this.render();
        return;
      }
      await this.backend.delay(POLL_MS);
    }
  }

  private blockActiveRecovery(reason: string): void {
    const state = this.state;
    if (!state || state.status !== "active") return;
    this.state = { ...state, status: "recovery-blocked", reason, notification: null, delivered: false };
    this.persist();
    this.render();
  }

  private blockRecovery(input: {
    request: NormalizedRequest;
    resources: ResourceIdentity;
    completionFile: string;
    dataDir: string;
    tuicrSession: TuicrSessionIdentity | null;
    reason: string;
  }): void {
    const ownerSessionId = this.context?.sessionManager.getSessionId();
    if (!ownerSessionId) return;
    this.state = {
      version: 1, ownerSessionId, status: "recovery-blocked", reason: input.reason,
      targetKey: input.request.targetKey, cwd: input.request.cwd, resources: input.resources,
      tuicrSession: input.tuicrSession, completionFile: input.completionFile, dataDir: input.dataDir,
      accepted: [], notification: null, delivered: false,
    };
    this.persist();
    this.render();
  }

  private persist(): void {
    if (this.state) this.pi.appendEntry(STATE_ENTRY, this.state);
  }

  private render(): void {
    const ctx = this.context;
    if (!ctx?.hasUI) return;
    const blocked = this.recoveryError ?? (this.state?.status === "recovery-blocked" ? this.state.reason : undefined);
    if (blocked) {
      ctx.ui.setWidget(WIDGET_ID, [`${ctx.ui.theme.fg("warning", "Review recovery blocked")}  ${singleLine(blocked)}`], { placement: "aboveEditor" });
      return;
    }
    if (this.state?.status !== "active") {
      ctx.ui.setWidget(WIDGET_ID, undefined);
      return;
    }
    ctx.ui.setWidget(
      WIDGET_ID,
      [`${ctx.ui.theme.fg("accent", "Review open")}  Tuicr · ${this.state.tuicrSession.slug} · seeded ${this.state.accepted.length}`],
      { placement: "aboveEditor" },
    );
  }

  private assertContext(ctx: ExtensionContext): void {
    if (this.context?.sessionManager.getSessionId() !== ctx.sessionManager.getSessionId()) {
      throw new Error("Tuicr review state is not active for this Pi session.");
    }
  }

  private isCurrent(generation: number): boolean {
    return generation === this.generation && this.context !== undefined;
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operation.then(operation, operation);
    this.operation = result.then(() => undefined, () => undefined);
    return result;
  }
}

function describe(annotation: Annotation): string {
  switch (annotation.kind) {
    case "review": return "review annotation";
    case "file": return annotation.file;
    case "line": return `${annotation.file}:${annotation.line}`;
    case "range": return `${annotation.file}:${annotation.startLine}-${annotation.endLine}`;
  }
}

function formatComments(comments: readonly StoredComment[]): string {
  if (comments.length === 0) return " none";
  return `\n${comments.map((comment) => [
    `- [${comment.id}] ${comment.location ?? comment.path ?? "review"}`,
    comment.content,
  ].join("\n")).join("\n")}`;
}

function singleLine(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 500);
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
