import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
  COORDINATOR_AUTHOR,
  STATE_ENTRY,
  annotationFingerprint,
  annotationPayload,
  commentFingerprint,
  discoverNewActive,
  normalizeRequest,
  restoreState,
  type AcceptedAnnotation,
  type Annotation,
  type NormalizedRequest,
  type PersistedState,
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
  preflight(cwd: string, signal?: AbortSignal): Promise<void>;
  listSessions(cwd: string, signal?: AbortSignal): Promise<readonly SessionSummary[]>;
  createTab(cwd: string, signal?: AbortSignal): Promise<ResourceIdentity>;
  launch(resources: ResourceIdentity, cwd: string, args: readonly string[], completionFile: string, signal?: AbortSignal): Promise<void>;
  comments(cwd: string, session: TuicrSessionIdentity, signal?: AbortSignal): Promise<readonly StoredComment[]>;
  add(cwd: string, session: TuicrSessionIdentity, payload: Record<string, unknown>, signal?: AbortSignal): Promise<StoredComment>;
  completion(completionFile: string): Promise<number | undefined>;
  resourceExists(resources: ResourceIdentity, signal?: AbortSignal): Promise<boolean>;
  closeTab(resources: ResourceIdentity, signal?: AbortSignal): Promise<void>;
  removeCompletionFile(completionFile: string): Promise<void>;
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
  private state?: PersistedState;
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
    this.state = restoreState(ctx.sessionManager.getBranch(), ctx.sessionManager.getSessionId());
    this.render();
    if (this.state?.status === "active") this.startWait(this.generation);
  }

  stop(): void {
    this.generation += 1;
    this.context?.ui.setWidget(WIDGET_ID, undefined);
    this.context = undefined;
    this.state = undefined;
  }

  ensure(input: ReviewRequest, ctx: ExtensionContext, signal?: AbortSignal): Promise<EnsureResult> {
    return this.enqueue(async () => {
      this.assertContext(ctx);
      const request = normalizeRequest(ctx.cwd, input);
      if (this.state?.status === "active") {
        if (this.state.targetKey !== request.targetKey) {
          throw new Error("A different Tuicr review is already active on this conversation branch. Complete or cancel it before opening another target.");
        }
        if (!await this.backend.resourceExists(this.state.resources, signal)) {
          await this.finish("cancelled", "The owned Herdr tab or pane was closed before Tuicr completed.");
          throw new Error("The active Tuicr review was cancelled because its owned Herdr resource was closed.");
        }
        const seeded = await this.seed(request.annotations, ctx, signal);
        return { reused: true, session: this.state.tuicrSession, ...seeded };
      }

      await this.backend.preflight(request.cwd, signal);
      const before = await this.backend.listSessions(request.cwd, signal);
      const resources = await this.backend.createTab(request.cwd, signal);
      const completionFile = this.backend.completionFile(ctx.sessionManager.getSessionId());
      let session: SessionSummary;
      try {
        await this.backend.launch(resources, request.cwd, request.launchArgs, completionFile, signal);
        session = await this.discover(request.cwd, before, resources, signal);
      } catch (error) {
        try {
          if (await this.backend.resourceExists(resources, signal)) await this.backend.closeTab(resources, signal);
        } catch {
          throw new Error(`${message(error)} The newly created tab could not be proven safe to close; it was preserved.`);
        }
        throw error;
      }

      this.state = {
        version: 1,
        ownerSessionId: ctx.sessionManager.getSessionId(),
        status: "active",
        targetKey: request.targetKey,
        cwd: request.cwd,
        resources,
        tuicrSession: { slug: session.slug, path: session.path },
        completionFile,
        accepted: [],
        delivered: false,
      };
      this.persist();
      this.render();
      const seeded = await this.seed(request.annotations, ctx, signal);
      this.startWait(this.generation);
      return { reused: false, session: this.state.tuicrSession, ...seeded };
    });
  }

  private async discover(
    cwd: string,
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
        return discoverNewActive(before, await this.backend.listSessions(cwd, signal));
      } catch (error) {
        lastError = error;
      }
      await this.backend.delay(POLL_MS, signal);
    }
    throw lastError instanceof Error ? lastError : new Error("Could not discover the exact active Tuicr session.");
  }

  private async seed(annotations: readonly Annotation[], ctx: ExtensionContext, signal?: AbortSignal) {
    if (!this.state) throw new Error("No active Tuicr review.");
    const comments = await this.backend.comments(this.state.cwd, this.state.tuicrSession, signal);
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
          this.state.cwd,
          this.state.tuicrSession,
          annotationPayload(annotation),
          signal,
        );
        acceptedByFingerprint.set(fingerprint, comment.id);
      } catch (error) {
        failures.push(`${describe(annotation)}: ${singleLine(message(error))}`);
      }
    }

    const requested = new Set(annotations.map(annotationFingerprint));
    const accepted: AcceptedAnnotation[] = [...acceptedByFingerprint]
      .filter(([fingerprint]) => requested.has(fingerprint) || this.state?.accepted.some((item) => item.fingerprint === fingerprint))
      .map(([fingerprint, commentId]) => ({ fingerprint, commentId }));
    this.state = { ...this.state, accepted };
    this.persist();
    this.render();
    return { acceptedCommentIds: accepted.map((item) => item.commentId), failures: failures.slice(0, 20) };
  }

  private startWait(generation: number): void {
    void this.waitForCompletion(generation).catch(async (error) => {
      if (this.isCurrent(generation)) await this.finish("failed", `Review monitoring failed: ${singleLine(message(error))}`);
    });
  }

  private async waitForCompletion(generation: number): Promise<void> {
    let failures = 0;
    while (this.isCurrent(generation) && this.state?.status === "active") {
      const state = this.state;
      try {
        const exitCode = await this.backend.completion(state.completionFile);
        if (exitCode !== undefined) {
          if (exitCode !== 0) {
            await this.finish("failed", `Tuicr exited with status ${exitCode}.`);
            return;
          }
          await this.completeNormally(state);
          return;
        }
        if (!await this.backend.resourceExists(state.resources)) {
          await this.finish("cancelled", "The owned Herdr tab or pane was closed before Tuicr completed.");
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
      comments = await this.backend.comments(state.cwd, state.tuicrSession);
    } catch (error) {
      await this.finish("failed", `Tuicr exited normally, but its exact persisted session could not be read: ${singleLine(message(error))}`, false);
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
    await this.finish("completed", outcome, true);
  }

  private async finish(
    status: "completed" | "failed" | "cancelled",
    outcome: string,
    closeOwned = status === "completed",
  ): Promise<void> {
    const state = this.state;
    if (!state || state.status !== "active") return;
    // Mark delivered in the durable branch-local transition before notification. This
    // intentionally prefers suppressing duplicate side effects after a crash.
    this.state = { ...state, status, delivered: true };
    this.persist();
    this.render();
    if (closeOwned) {
      try {
        if (await this.backend.resourceExists(state.resources)) await this.backend.closeTab(state.resources);
      } catch {
        // Identity is retained in the persisted transition; uncertain resources are preserved.
      }
    }
    await this.backend.removeCompletionFile(state.completionFile).catch(() => undefined);
    this.pi.sendMessage(
      { customType: "tuicr-review-completion", content: outcome, display: true, details: { status, session: state.tuicrSession } },
      { deliverAs: "followUp", triggerTurn: true },
    );
  }

  private persist(): void {
    if (this.state) this.pi.appendEntry(STATE_ENTRY, this.state);
  }

  private render(): void {
    const ctx = this.context;
    if (!ctx?.hasUI) return;
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
  return `\n${comments.slice(0, 50).map((comment) => `- [${comment.id}] ${comment.location ?? "review"}: ${singleLine(comment.content)}`).join("\n")}`;
}

function singleLine(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 500);
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
