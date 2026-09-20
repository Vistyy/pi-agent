import { tmpdir } from "node:os";
import { basename, dirname, resolve } from "node:path";
import type { Annotation, Comment, ExactComparison, OwnedReview, PersistedReview, ReviewInput } from "./types.ts";

export const STATE_ENTRY = "tuicr-review";
export const PI_AUTHOR = "Pi";

export interface ReviewRequest {
  cwd: string;
  base: string;
  head: string;
  replaceExisting: boolean;
  annotations: Annotation[];
}

export interface NormalizedReview extends ReviewRequest, ExactComparison {
  targetKey: string;
  launchArgs: string[];
}

export function normalizeRequest(originCwd: string, input: ReviewInput): ReviewRequest {
  const base = input.base.trim();
  const head = input.head.trim();
  if (!base || !head) throw new Error("Both base and head revisions are required.");
  return {
    cwd: resolve(originCwd, input.cwd?.trim() || "."),
    base,
    head,
    replaceExisting: input.replaceExisting,
    annotations: (input.annotations ?? []).map(normalizeAnnotation),
  };
}

export function exactReview(request: ReviewRequest, comparison: ExactComparison): NormalizedReview {
  const targetKey = JSON.stringify({ cwd: request.cwd, base: comparison.base, head: comparison.head });
  return {
    ...request,
    ...comparison,
    targetKey,
    launchArgs: ["--revisions", `${comparison.base}..${comparison.head}`, "--stdout", "--no-update-check"],
  };
}

function normalizeAnnotation(annotation: Annotation): Annotation {
  const content = annotation.content.trim();
  if (!content) throw new Error("Annotation content must not be blank.");
  if (annotation.kind === "review") return { kind: "review", content };
  const file = annotation.file.trim();
  if (!file) throw new Error("Annotation file must not be blank.");
  if (annotation.kind === "file") return { kind: "file", file, content };
  if (annotation.kind === "line") {
    positive(annotation.line, "line");
    return { kind: "line", file, line: annotation.line, side: annotation.side ?? "new", content };
  }
  positive(annotation.startLine, "startLine");
  positive(annotation.endLine, "endLine");
  if (annotation.endLine < annotation.startLine) throw new Error("Annotation endLine must be at least startLine.");
  return { kind: "range", file, startLine: annotation.startLine, endLine: annotation.endLine, side: annotation.side ?? "new", content };
}

function positive(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 1) throw new Error(`Annotation ${name} must be a positive integer.`);
}

export function annotationKey(annotation: Annotation): string { return JSON.stringify(annotation); }

export function commentAnnotationKey(comment: Comment): string | undefined {
  if (comment.author !== PI_AUTHOR) return undefined;
  const content = comment.content.trim();
  if (!content) return undefined;
  const file = comment.path?.trim();
  if (!file) return annotationKey({ kind: "review", content });
  const start = comment.start_line;
  const end = comment.end_line;
  if (start == null && end == null) return annotationKey({ kind: "file", file, content });
  if (!Number.isInteger(start) || start! < 1) return undefined;
  const side = comment.side ?? "new";
  if (end == null || end === start) return annotationKey({ kind: "line", file, line: start!, side, content });
  if (!Number.isInteger(end) || end! < start!) return undefined;
  return annotationKey({ kind: "range", file, startLine: start!, endLine: end!, side, content });
}

export function annotationPayload(annotation: Annotation): Record<string, unknown> {
  const payload: Record<string, unknown> = { content: annotation.content, username: PI_AUTHOR };
  if (annotation.kind !== "review") payload.file = annotation.file;
  if (annotation.kind === "line") Object.assign(payload, { line: annotation.line, side: annotation.side ?? "new" });
  if (annotation.kind === "range") Object.assign(payload, { start_line: annotation.startLine, end_line: annotation.endLine, side: annotation.side ?? "new" });
  return payload;
}

export function describeAnnotation(annotation: Annotation): string {
  if (annotation.kind === "review") return "review annotation";
  if (annotation.kind === "file") return annotation.file;
  if (annotation.kind === "line") return `${annotation.file}:${annotation.line}`;
  return `${annotation.file}:${annotation.startLine}-${annotation.endLine}`;
}

export function splitComments(comments: Comment[], accepted: Record<string, string>): { seeded: Comment[]; maintainer: Comment[] } {
  const seededIds = new Set(Object.values(accepted));
  return { seeded: comments.filter((comment) => seededIds.has(comment.id)), maintainer: comments.filter((comment) => !seededIds.has(comment.id)) };
}

export function restoreReview(entries: readonly unknown[], ownerSessionId: string): PersistedReview | undefined {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index] as { type?: unknown; customType?: unknown; data?: unknown };
    if (entry?.type !== "custom" || entry.customType !== STATE_ENTRY) continue;
    const data = entry.data as Partial<PersistedReview> | undefined;
    if (data?.ownerSessionId !== ownerSessionId) continue;
    if (data.state === "cleared") return undefined;
    if (data.state === "finished" && typeof data.deliveryId === "string" && /^[0-9a-f-]{36}$/i.test(data.deliveryId) && validFeedback(data.feedback)) return data as PersistedReview;
    if (data.state === "active" && validOwnedReview(data.review, ownerSessionId)) return data as PersistedReview;
    return undefined;
  }
  return undefined;
}

export function hasFeedback(entries: readonly unknown[], deliveryId: string): boolean {
  return entries.some((entry) => {
    const value = entry as { type?: unknown; customType?: unknown; details?: { deliveryId?: unknown } };
    return value?.type === "custom_message" && value.customType === "tuicr-review-feedback" && value.details?.deliveryId === deliveryId;
  });
}

function validOwnedReview(value: unknown, ownerSessionId: string): value is OwnedReview {
  if (!value || typeof value !== "object") return false;
  const review = value as Partial<OwnedReview>;
  const strings = [review.targetKey, review.cwd, review.base, review.head, review.tabId, review.paneId, review.sessionId, review.dataHome, review.completionFile];
  if (strings.some((item) => typeof item !== "string" || !item)) return false;
  if (!review.accepted || typeof review.accepted !== "object" || Array.isArray(review.accepted) || Object.values(review.accepted).some((id) => typeof id !== "string" || !id)) return false;
  if (!Array.isArray(review.reported) || review.reported.some((id) => typeof id !== "string" || !id)) return false;
  const expectedPrefix = `pi-tuicr-review-${ownerSessionId}-`;
  return resolve(review.dataHome!) === review.dataHome && dirname(review.dataHome!) === tmpdir()
    && basename(review.dataHome!).startsWith(expectedPrefix) && dirname(review.completionFile!) === review.dataHome
    && basename(review.completionFile!) === "exit";
}

function validFeedback(value: unknown): value is import("./types.ts").ReviewFeedback {
  if (!value || typeof value !== "object") return false;
  const feedback = value as Partial<import("./types.ts").ReviewFeedback>;
  return (feedback.status === "completed" || feedback.status === "failed" || feedback.status === "cancelled" || feedback.status === "replaced")
    && typeof feedback.sessionId === "string" && !!feedback.sessionId
    && typeof feedback.base === "string" && !!feedback.base && typeof feedback.head === "string" && !!feedback.head
    && Array.isArray(feedback.seeded) && Array.isArray(feedback.maintainer);
}
