import { resolve } from "node:path";
import type { Annotation, Comment, PersistedReview, ReviewInput, ReviewTarget } from "./types.ts";

export const STATE_ENTRY = "tuicr-review";
export const PI_AUTHOR = "Pi";

export interface NormalizedReview {
  cwd: string;
  target: ReviewTarget;
  targetKey: string;
  launchArgs: string[];
  annotations: Annotation[];
}

export function normalizeReview(originCwd: string, input: ReviewInput): NormalizedReview {
  const cwd = resolve(originCwd, input.cwd?.trim() || ".");
  const target = normalizeTarget(input.target);
  const annotations = (input.annotations ?? []).map(normalizeAnnotation);
  return {
    cwd,
    target,
    targetKey: JSON.stringify({ cwd, target }),
    launchArgs: target.kind === "workingTree"
      ? ["--working-tree", "--stdout", "--no-update-check"]
      : ["--revisions", target.revset, ...(target.includeWorkingTree ? ["--working-tree"] : []), "--stdout", "--no-update-check"],
    annotations,
  };
}

function normalizeTarget(target: ReviewTarget): ReviewTarget {
  if (target.kind === "workingTree") return { kind: "workingTree" };
  const revset = target.revset.trim();
  if (!revset) throw new Error("A revision target requires a non-empty revset.");
  return { kind: "revisions", revset, ...(target.includeWorkingTree ? { includeWorkingTree: true } : {}) };
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
  return {
    kind: "range", file, startLine: annotation.startLine, endLine: annotation.endLine,
    side: annotation.side ?? "new", content,
  };
}

function positive(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 1) throw new Error(`Annotation ${name} must be a positive integer.`);
}

export function annotationKey(annotation: Annotation): string {
  return JSON.stringify(annotation);
}

export function annotationPayload(annotation: Annotation): Record<string, unknown> {
  const payload: Record<string, unknown> = { content: annotation.content, username: PI_AUTHOR };
  if (annotation.kind !== "review") payload.file = annotation.file;
  if (annotation.kind === "line") Object.assign(payload, { line: annotation.line, side: annotation.side ?? "new" });
  if (annotation.kind === "range") Object.assign(payload, {
    start_line: annotation.startLine,
    end_line: annotation.endLine,
    side: annotation.side ?? "new",
  });
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
  return {
    seeded: comments.filter((comment) => seededIds.has(comment.id)),
    maintainer: comments.filter((comment) => !seededIds.has(comment.id)),
  };
}

export function restoreReview(entries: readonly unknown[], ownerSessionId: string): PersistedReview | undefined {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index] as { type?: unknown; customType?: unknown; data?: unknown };
    if (entry?.type !== "custom" || entry.customType !== STATE_ENTRY) continue;
    const data = entry.data as Partial<PersistedReview> | undefined;
    if (data?.ownerSessionId === ownerSessionId && (data.state === "active" || data.state === "finished")) {
      return data as PersistedReview;
    }
  }
  return undefined;
}
