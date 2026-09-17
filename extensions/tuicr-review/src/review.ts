import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { annotationKey, annotationPayload, describeAnnotation, normalizeReview, restoreReview, splitComments, STATE_ENTRY } from "./model.ts";
import type { ReviewCommands } from "./commands.ts";
import type { Annotation, OwnedReview, PersistedReview, ReviewFeedback, ReviewInput } from "./types.ts";

type Launcher = Pick<ReviewCommands, "launch">;
type Comments = Pick<ReviewCommands, "comments" | "add">;
type Lifecycle = Pick<ReviewCommands, "completion" | "tabExists" | "cleanup" | "sleep">;

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
  private readonly pi: Pick<ExtensionAPI, "appendEntry" | "sendMessage">;
  private readonly launcher: Launcher;
  private readonly comments: Comments;
  private readonly lifecycle: Lifecycle;

  constructor(
    pi: Pick<ExtensionAPI, "appendEntry" | "sendMessage">,
    launcher: Launcher,
    comments: Comments,
    lifecycle: Lifecycle,
  ) {
    this.pi = pi;
    this.launcher = launcher;
    this.comments = comments;
    this.lifecycle = lifecycle;
  }

  async restore(ctx: ExtensionContext): Promise<void> {
    this.generation += 1;
    this.context = ctx;
    // Session navigation can restart lifecycle events in the same extension process.
    // Keep an in-memory ready review attached to that process rather than adopting
    // state from the newly visible conversation branch.
    if (!this.current || this.current.state !== "active") {
      this.current = restoreReview(ctx.sessionManager.getBranch(), ctx.sessionManager.getSessionId());
    }
    if (this.current?.state === "active") this.monitor(this.current.review, this.generation);
    if (this.current?.state === "finished" && !this.current.delivered) this.deliver(this.current);
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
        return { reused: true, sessionId: this.current.review.sessionId, ...await this.seed(this.current.review, request.annotations, signal) };
      }
      if (this.current?.state === "finished" && !this.current.delivered) this.deliver(this.current);

      const ownerSessionId = ctx.sessionManager.getSessionId();
      const review = await this.launcher.launch(request, ownerSessionId, signal);
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

  private async seed(review: OwnedReview, annotations: Annotation[], signal?: AbortSignal) {
    const failures: string[] = [];
    for (const annotation of annotations) {
      const key = annotationKey(annotation);
      if (review.accepted[key]) continue;
      if (signal?.aborted) throw signal.reason ?? new Error("Annotation seeding was cancelled.");
      try {
        review.accepted[key] = await this.comments.add(review, annotationPayload(annotation), signal);
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
        void this.enqueue(() => this.finish(review, "failed", `Review monitoring failed: ${message(error)}`));
      }
    });
  }

  private async wait(review: OwnedReview, generation: number): Promise<void> {
    while (this.isCurrent(review, generation)) {
      const exitCode = await this.lifecycle.completion(review);
      if (exitCode !== undefined) {
        await this.enqueue(() => this.finish(
          review,
          exitCode === 0 ? "completed" : "failed",
          exitCode === 0 ? undefined : `Tuicr exited with status ${exitCode}.`,
        ));
        return;
      }
      if (!await this.lifecycle.tabExists(review)) {
        await this.enqueue(() => this.finish(review, "cancelled", "The owned Herdr tab closed before Tuicr completed."));
        return;
      }
      await this.lifecycle.sleep(250);
    }
  }

  private async finish(review: OwnedReview, status: ReviewFeedback["status"], failure?: string): Promise<void> {
    if (this.current?.state !== "active" || this.current.review !== review) return;
    let seeded: ReviewFeedback["seeded"] = [];
    let maintainer: ReviewFeedback["maintainer"] = [];
    let messageText = failure;
    try {
      ({ seeded, maintainer } = splitComments(await this.comments.comments(review), review.accepted));
    } catch (error) {
      status = "failed";
      messageText = [failure, `Could not read the exact Tuicr session: ${message(error)}`].filter(Boolean).join(" ");
    }
    const finished: PersistedReview = {
      state: "finished",
      ownerSessionId: this.current.ownerSessionId,
      targetKey: review.targetKey,
      feedback: { status, sessionId: review.sessionId, seeded, maintainer, ...(messageText ? { message: messageText } : {}) },
      delivered: false,
    };
    this.current = finished;
    this.persist(finished);

    const warnings = await this.lifecycle.cleanup(review);
    if (warnings.length) {
      finished.feedback.cleanupWarnings = warnings;
      this.persist(finished);
    }
    this.deliver(finished);
  }

  private deliver(finished: Extract<PersistedReview, { state: "finished" }>): void {
    if (finished.delivered || this.current !== finished) return;
    const feedback = finished.feedback;
    try {
      this.pi.sendMessage({
        customType: "tuicr-review-feedback",
        content: formatFeedback(feedback),
        display: true,
        details: feedback,
      }, { deliverAs: "followUp", triggerTurn: true });
    } catch {
      return;
    }
    finished.delivered = true;
    this.persist(finished);
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
