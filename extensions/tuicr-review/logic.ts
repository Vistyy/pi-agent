import { resolve } from "node:path";

export const STATE_ENTRY = "tuicr-review-state";
export const COORDINATOR_AUTHOR = "Pi Coordinator";

export type ReviewTarget =
  | { readonly kind: "workingTree" }
  | { readonly kind: "revisions"; readonly revset: string; readonly includeWorkingTree?: boolean };

export type AnnotationTarget =
  | { readonly kind: "review" }
  | { readonly kind: "file"; readonly file: string }
  | { readonly kind: "line"; readonly file: string; readonly line: number; readonly side?: "old" | "new" }
  | { readonly kind: "range"; readonly file: string; readonly startLine: number; readonly endLine: number; readonly side?: "old" | "new" };

export type Annotation = AnnotationTarget & {
  readonly content: string;
  readonly type?: string;
};

export interface ReviewRequest {
  readonly cwd?: string;
  readonly target: ReviewTarget;
  readonly annotations?: readonly Annotation[];
}

export interface NormalizedRequest {
  readonly cwd: string;
  readonly target: ReviewTarget;
  readonly targetKey: string;
  readonly launchArgs: readonly string[];
  readonly annotations: readonly Annotation[];
}

export interface ResourceIdentity {
  readonly workspaceId: string;
  readonly tabId: string;
  readonly paneId: string;
}

export interface TuicrSessionIdentity {
  readonly slug: string;
  readonly path: string;
}

export interface AcceptedAnnotation {
  readonly fingerprint: string;
  readonly commentId: string;
}

export interface PersistedState {
  readonly version: 1;
  readonly ownerSessionId: string;
  readonly status: "active" | "completed" | "failed" | "cancelled";
  readonly targetKey: string;
  readonly cwd: string;
  readonly resources: ResourceIdentity;
  readonly tuicrSession: TuicrSessionIdentity;
  readonly completionFile: string;
  readonly accepted: readonly AcceptedAnnotation[];
  readonly delivered: boolean;
}

export interface SessionSummary extends TuicrSessionIdentity {
  readonly active: boolean;
}

export interface StoredComment {
  readonly id: string;
  readonly location?: string;
  readonly path?: string;
  readonly start_line?: number;
  readonly end_line?: number;
  readonly side?: "old" | "new";
  readonly comment_type?: string;
  readonly author?: string;
  readonly content: string;
}

export function normalizeRequest(originCwd: string, input: ReviewRequest): NormalizedRequest {
  const cwd = resolve(originCwd, input.cwd?.trim() || ".");
  const target = normalizeTarget(input.target);
  const annotations = (input.annotations ?? []).map(normalizeAnnotation);
  const launchArgs = target.kind === "workingTree"
    ? ["--working-tree", "--stdout"]
    : ["--revisions", target.revset, ...(target.includeWorkingTree ? ["--working-tree"] : []), "--stdout"];
  return {
    cwd,
    target,
    targetKey: JSON.stringify({ cwd, target }),
    launchArgs,
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
  const type = annotation.type?.trim();
  const common = { content, ...(type ? { type } : {}) };
  switch (annotation.kind) {
    case "review": return { kind: "review", ...common };
    case "file": return { kind: "file", file: nonBlank(annotation.file, "file"), ...common };
    case "line": return {
      kind: "line", file: nonBlank(annotation.file, "file"), line: positive(annotation.line, "line"),
      side: annotation.side ?? "new", ...common,
    };
    case "range": {
      const startLine = positive(annotation.startLine, "startLine");
      const endLine = positive(annotation.endLine, "endLine");
      if (endLine < startLine) throw new Error("Annotation endLine must be at least startLine.");
      return {
        kind: "range", file: nonBlank(annotation.file, "file"), startLine, endLine,
        side: annotation.side ?? "new", ...common,
      };
    }
  }
}

function nonBlank(value: string, field: string): string {
  const result = value.trim();
  if (!result) throw new Error(`Annotation ${field} must not be blank.`);
  return result;
}

function positive(value: number, field: string): number {
  if (!Number.isInteger(value) || value < 1) throw new Error(`Annotation ${field} must be a positive integer.`);
  return value;
}

export function annotationFingerprint(annotation: Annotation): string {
  return JSON.stringify(annotation);
}

export function commentFingerprint(comment: StoredComment): string | undefined {
  if (comment.author !== COORDINATOR_AUTHOR) return undefined;
  const common = {
    content: comment.content.trim(),
    ...(comment.comment_type && comment.comment_type !== "none" ? { type: comment.comment_type } : {}),
  };
  if (!comment.path) return annotationFingerprint({ kind: "review", ...common });
  if (comment.start_line === undefined) return annotationFingerprint({ kind: "file", file: comment.path, ...common });
  if (comment.end_line !== undefined && comment.end_line !== comment.start_line) {
    return annotationFingerprint({
      kind: "range", file: comment.path, startLine: comment.start_line, endLine: comment.end_line,
      ...(comment.side ? { side: comment.side } : {}), ...common,
    });
  }
  return annotationFingerprint({
    kind: "line", file: comment.path, line: comment.start_line,
    ...(comment.side ? { side: comment.side } : {}), ...common,
  });
}

export function annotationPayload(annotation: Annotation): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    content: annotation.content,
    username: COORDINATOR_AUTHOR,
    ...(annotation.type ? { type: annotation.type } : {}),
  };
  if (annotation.kind !== "review") payload.file = annotation.file;
  if (annotation.kind === "line") {
    payload.line = annotation.line;
    payload.side = annotation.side ?? "new";
  } else if (annotation.kind === "range") {
    payload.start_line = annotation.startLine;
    payload.end_line = annotation.endLine;
    payload.side = annotation.side ?? "new";
  }
  return payload;
}

export function discoverNewActive(before: readonly SessionSummary[], after: readonly SessionSummary[]): SessionSummary {
  const previouslyActive = new Set(before.filter((item) => item.active).map(identityKey));
  const candidates = after.filter((item) => item.active && !previouslyActive.has(identityKey(item)));
  if (candidates.length !== 1) {
    throw new Error(`Expected one newly active Tuicr session, found ${candidates.length}; exact session identity is uncertain.`);
  }
  return candidates[0]!;
}

export function restoreState(entries: readonly unknown[], ownerSessionId: string): PersistedState | undefined {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index] as { type?: unknown; customType?: unknown; data?: unknown };
    if (entry?.type !== "custom" || entry.customType !== STATE_ENTRY || !isState(entry.data)) continue;
    if (entry.data.ownerSessionId === ownerSessionId) return entry.data;
  }
  return undefined;
}

function isState(value: unknown): value is PersistedState {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<PersistedState>;
  return item.version === 1 && typeof item.ownerSessionId === "string" && typeof item.targetKey === "string"
    && typeof item.cwd === "string" && typeof item.completionFile === "string" && typeof item.delivered === "boolean"
    && !!item.resources && !!item.tuicrSession && Array.isArray(item.accepted)
    && ["active", "completed", "failed", "cancelled"].includes(item.status as string);
}

function identityKey(item: TuicrSessionIdentity): string {
  return `${item.slug}\0${item.path}`;
}
