import { randomUUID } from "node:crypto";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
  annotationKey, annotationPayload, commentAnnotationKey, describeAnnotation, hasFeedback, normalizeReview,
  restoreReview, splitComments, STATE_ENTRY,
} from "./model.ts";
import type { ReviewCommands } from "./commands.ts";
import type { Annotation, Comment, OwnedReview, PersistedReview, ReviewFeedback, ReviewInput } from "./types.ts";

type ReviewOperations = Pick<ReviewCommands,
  "launch" | "comments" | "add" | "completion" | "tabExists" | "dataExists" | "cleanup" | "sleep"
>;

export interface EnsureResult {
  reused: boolean;
  sessionId: string;
  acceptedCommentIds: string[];
  failures: string[];
}

export class GuidedReview {
  private current?: PersistedReview;
  private context?: ExtensionContext;
  private generation = 0;
  private queue: Promise<unknown> = Promise.resolve();
  private readonly sentDeliveries = new Set<string>();

  constructor(
    private readonly pi: Pick<ExtensionAPI, "appendEntry" | "sendMessage">,
    private readonly commands: ReviewOperations,
  ) {}

  async restore(ctx: ExtensionContext): Promise<void> {
    this.generation += 1;
    this.context = ctx;
    if (!this.current) this.current = restoreReview(ctx.sessionManager.getBranch(), ctx.sessionManager.getSessionId());
    else this.persist(this.current);
    if (this.current?.state === "active") await this.resumeActive(this.current.review, this.generation);
    if (this.current?.state === "finished") this.deliver(this.current);
  }

  async tree(ctx: ExtensionContext): Promise<void> {
    this.context = ctx;
    if (this.current) this.persist(this.current);
    if (this.current?.state === "finished") this.deliver(this.current);
  }

  ensure(input: ReviewInput, ctx: ExtensionContext, signal?: AbortSignal): Promise<EnsureResult> {
    return this.enqueue(async () => {
      if (!this.context) {
        this.context = ctx;
        this.generation += 1;
      }
      const request = normalizeReview(ctx.cwd, input);
      if (this.current?.state === "active") {
        if (this.current.review.targetKey !== request.targetKey) {
          throw new Error("A different Tuicr review is already active. Finish it before opening another target.");
        }
        const disposition = await this.inspectActive(this.current.review);
        if (disposition === "live") {
          return { reused: true, sessionId: this.current.review.sessionId, ...await this.seed(this.current.review, request.annotations, signal) };
        }
        if (disposition !== "gone") throw new Error("The previous Tuicr review finished while reuse was requested; call again to open a new review.");
      }

      const ownerSessionId = ctx.sessionManager.getSessionId();
      const review = await this.commands.launch(request, ownerSessionId, signal);
      this.current = { state: "active", ownerSessionId, review };
      this.persist(this.current);
      try {
        return { reused: false, sessionId: review.sessionId, ...await this.seed(review, request.annotations, signal) };
      } finally {
        this.monitor(review, this.generation);
      }
    });
  }

  shutdown(): void {
    this.generation += 1;
    this.context = undefined;
  }

  private async resumeActive(review: OwnedReview, generation: number): Promise<void> {
    const disposition = await this.inspectActive(review);
    if (disposition === "live" && this.isCurrent(review, generation)) this.monitor(review, generation);
  }

  private async inspectActive(review: OwnedReview): Promise<"live" | "finished" | "gone"> {
    try {
      const exitCode = await this.retry(() => this.commands.completion(review));
      if (exitCode !== undefined) {
        await this.finish(review, exitCode === 0 ? "completed" : "failed", exitCode === 0 ? undefined : `Tuicr exited with status ${exitCode}.`);
        return "finished";
      }
      if (await this.retry(() => this.commands.tabExists(review))) return "live";
      if (!await this.retry(() => this.commands.dataExists(review))) {
        this.clear(review);
        return "gone";
      }
      await this.finish(review, "cancelled", "The owned Herdr tab closed before Tuicr completed.");
      return "finished";
    } catch (error) {
      await this.failPreserving(review, `Could not inspect the exact Tuicr review after retries: ${message(error)}`);
      return "finished";
    }
  }

  private async seed(review: OwnedReview, annotations: Annotation[], signal?: AbortSignal) {
    const existing = await this.retry(() => this.commands.comments(review, signal));
    for (const comment of existing) {
      const key = commentAnnotationKey(comment);
      if (key && !review.accepted[key]) review.accepted[key] = comment.id;
    }
    this.persistActive(review);

    const failures: string[] = [];
    for (const annotation of annotations) {
      const key = annotationKey(annotation);
      if (review.accepted[key]) continue;
      if (signal?.aborted) throw signal.reason ?? new Error("Annotation seeding was cancelled.");
      try {
        review.accepted[key] = await this.commands.add(review, annotationPayload(annotation), signal);
        this.persistActive(review);
      } catch (error) {
        if (signal?.aborted) throw signal.reason ?? error;
        failures.push(`${describeAnnotation(annotation)}: ${oneLine(message(error))}`);
      }
    }
    return { acceptedCommentIds: Object.values(review.accepted), failures };
  }

  private monitor(review: OwnedReview, generation: number): void {
    void this.wait(review, generation).catch((error) => {
      if (this.isCurrent(review, generation)) {
        void this.enqueue(() => this.failPreserving(review, `Review monitoring failed after retries: ${message(error)}`));
      }
    });
  }

  private async wait(review: OwnedReview, generation: number): Promise<void> {
    while (this.isCurrent(review, generation)) {
      const exitCode = await this.retry(() => this.commands.completion(review));
      if (exitCode !== undefined) {
        await this.enqueue(() => this.finish(
          review,
          exitCode === 0 ? "completed" : "failed",
          exitCode === 0 ? undefined : `Tuicr exited with status ${exitCode}.`,
        ));
        return;
      }
      if (!await this.retry(() => this.commands.tabExists(review))) {
        await this.enqueue(async () => {
          if (!await this.retry(() => this.commands.dataExists(review))) this.clear(review);
          else await this.finish(review, "cancelled", "The owned Herdr tab closed before Tuicr completed.");
        });
        return;
      }
      await this.commands.sleep(250);
    }
  }

  private async finish(review: OwnedReview, status: ReviewFeedback["status"], failure?: string): Promise<void> {
    if (this.current?.state !== "active" || this.current.review !== review) return;
    let comments: Comment[];
    try {
      comments = await this.retry(() => this.commands.comments(review));
    } catch (error) {
      await this.failPreserving(review, [failure, `Could not read the exact Tuicr session after retries; owned resources were preserved: ${message(error)}`].filter(Boolean).join(" "));
      return;
    }
    const { seeded, maintainer } = splitComments(comments, review.accepted);
    const finished = this.makeFinished(review, { status, sessionId: review.sessionId, seeded, maintainer, ...(failure ? { message: failure } : {}) });
    const warnings = await this.commands.cleanup(review);
    if (warnings.length) {
      finished.feedback.cleanupWarnings = warnings;
      this.persist(finished);
    }
    this.deliver(finished);
  }

  private async failPreserving(review: OwnedReview, reason: string): Promise<void> {
    if (this.current?.state !== "active" || this.current.review !== review) return;
    const feedback: ReviewFeedback = {
      status: "failed", sessionId: review.sessionId, seeded: [], maintainer: [], message: reason,
    };
    this.deliver(this.makeFinished(review, feedback));
  }

  private makeFinished(review: OwnedReview, feedback: ReviewFeedback): Extract<PersistedReview, { state: "finished" }> {
    const ownerSessionId = this.current!.ownerSessionId;
    const finished = { state: "finished" as const, ownerSessionId, targetKey: review.targetKey, deliveryId: randomUUID(), feedback };
    this.current = finished;
    this.persist(finished);
    return finished;
  }

  private clear(review: OwnedReview): void {
    if (this.current?.state !== "active" || this.current.review !== review) return;
    const cleared: PersistedReview = {
      state: "cleared", ownerSessionId: this.current.ownerSessionId, targetKey: review.targetKey,
    };
    this.current = cleared;
    this.persist(cleared);
    this.current = undefined;
  }

  private deliver(finished: Extract<PersistedReview, { state: "finished" }>): void {
    if (this.current !== finished || this.sentDeliveries.has(finished.deliveryId)) return;
    const branch = this.context?.sessionManager.getBranch() ?? [];
    if (hasFeedback(branch, finished.deliveryId)) return;
    this.sentDeliveries.add(finished.deliveryId);
    try {
      this.pi.sendMessage({
        customType: "tuicr-review-feedback",
        content: formatFeedback(finished.feedback),
        display: true,
        details: { ...finished.feedback, deliveryId: finished.deliveryId },
      }, { deliverAs: "followUp", triggerTurn: true });
    } catch {
      this.sentDeliveries.delete(finished.deliveryId);
    }
  }

  private persistActive(review: OwnedReview): void {
    if (this.current?.state === "active" && this.current.review === review) this.persist(this.current);
  }

  private persist(state: PersistedReview): void {
    this.pi.appendEntry(STATE_ENTRY, state);
  }

  private isCurrent(review: OwnedReview, generation: number): boolean {
    return generation === this.generation && this.current?.state === "active" && this.current.review === review;
  }

  private async retry<T>(operation: () => Promise<T>): Promise<T> {
    let last: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try { return await operation(); }
      catch (error) {
        last = error;
        if (attempt < 2) await this.commands.sleep(25);
      }
    }
    throw last;
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(operation, operation);
    this.queue = result.then(() => undefined, () => undefined);
    return result;
  }
}

function formatFeedback(feedback: ReviewFeedback): string {
  const sections = [
    `Tuicr review ${feedback.status}.`,
    ...(feedback.message ? [feedback.message] : []),
    `Seeded Pi annotations (${feedback.seeded.length}):${formatComments(feedback.seeded)}`,
    `Maintainer comments (${feedback.maintainer.length}):${formatComments(feedback.maintainer)}`,
    ...(feedback.cleanupWarnings?.length ? [`Cleanup warnings:\n${feedback.cleanupWarnings.map((warning) => `- ${warning}`).join("\n")}`] : []),
  ];
  return sections.join("\n");
}
function formatComments(comments: ReviewFeedback["seeded"]): string {
  if (!comments.length) return " none";
  return `\n${comments.map((comment) => `- [${comment.id}] ${comment.location ?? comment.path ?? "review"}\n${comment.content}`).join("\n")}`;
}
function oneLine(value: string): string { return value.replace(/\s+/g, " ").trim().slice(0, 500); }
function message(error: unknown): string { return error instanceof Error ? error.message : String(error); }
