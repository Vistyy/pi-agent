import { tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

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

export interface RecoveryBlockedState {
  readonly version: 1;
  readonly ownerSessionId: string;
  readonly status: "recovery-blocked";
  readonly reason: string;
  readonly targetKey: string;
  readonly cwd: string;
  readonly resources: ResourceIdentity;
  readonly tuicrSession: TuicrSessionIdentity | null;
  readonly completionFile: string;
  readonly accepted: readonly AcceptedAnnotation[];
  readonly delivered: false;
}

export type RestoredState =
  | { readonly kind: "none" }
  | { readonly kind: "known"; readonly state: PersistedState | RecoveryBlockedState }
  | { readonly kind: "malformed"; readonly reason: string };

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
    ? ["--working-tree", "--stdout", "--no-update-check"]
    : ["--revisions", target.revset, ...(target.includeWorkingTree ? ["--working-tree"] : []), "--stdout", "--no-update-check"];
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

export function completionFilePath(ownerSessionId: string, uniqueId: string): string {
  return join(tmpdir(), `pi-tuicr-review-${ownerSessionId}-${uniqueId}.exit`);
}

export function isOwnedCompletionFile(path: string, ownerSessionId: string): boolean {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const prefix = join(tmpdir(), `pi-tuicr-review-${ownerSessionId}-`);
  if (!path.startsWith(prefix) || !path.endsWith(".exit")) return false;
  const uniqueId = path.slice(prefix.length, -5);
  return uuid.test(uniqueId) && path === completionFilePath(ownerSessionId, uniqueId);
}

export function restoreState(entries: readonly unknown[], ownerSessionId: string): RestoredState {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index] as { type?: unknown; customType?: unknown; data?: unknown };
    if (entry?.type !== "custom" || entry.customType !== STATE_ENTRY) continue;
    if (!isRecord(entry.data) || entry.data.ownerSessionId !== ownerSessionId) continue;
    // Never fall back past the latest owned transition: malformed identity may still
    // describe a live resource, but is not trustworthy enough to inspect or close.
    if (isState(entry.data, ownerSessionId) || isRecoveryBlockedState(entry.data, ownerSessionId)) {
      return { kind: "known", state: entry.data };
    }
    return { kind: "malformed", reason: "The latest owned Tuicr review transition is malformed; its resource identity is uncertain." };
  }
  return { kind: "none" };
}

function isState(value: Record<string, unknown>, ownerSessionId: string): value is Record<string, unknown> & PersistedState {
  if (!exactKeys(value, [
    "version", "ownerSessionId", "status", "targetKey", "cwd", "resources", "tuicrSession",
    "completionFile", "accepted", "delivered",
  ])) return false;
  if (value.version !== 1 || value.ownerSessionId !== ownerSessionId || !nonEmpty(value.targetKey)
    || !nonEmpty(value.cwd) || !isAbsolute(value.cwd) || typeof value.delivered !== "boolean"
    || !nonEmpty(value.completionFile) || !isOwnedCompletionFile(value.completionFile, ownerSessionId)) return false;
  if (!isStatus(value.status) || value.delivered !== (value.status !== "active")) return false;
  if (!isResourceIdentity(value.resources) || !isTuicrSessionIdentity(value.tuicrSession)) return false;
  if (!Array.isArray(value.accepted) || !value.accepted.every(isAcceptedAnnotation)) return false;
  const accepted = value.accepted as AcceptedAnnotation[];
  return new Set(accepted.map((item) => item.fingerprint)).size === accepted.length
    && new Set(accepted.map((item) => item.commentId)).size === accepted.length;
}

function isRecoveryBlockedState(value: Record<string, unknown>, ownerSessionId: string): value is Record<string, unknown> & RecoveryBlockedState {
  if (!exactKeys(value, [
    "version", "ownerSessionId", "status", "reason", "targetKey", "cwd", "resources", "tuicrSession",
    "completionFile", "accepted", "delivered",
  ])) return false;
  return value.version === 1 && value.ownerSessionId === ownerSessionId && value.status === "recovery-blocked"
    && nonEmpty(value.reason) && nonEmpty(value.targetKey) && nonEmpty(value.cwd) && isAbsolute(value.cwd)
    && isResourceIdentity(value.resources)
    && (value.tuicrSession === null || isTuicrSessionIdentity(value.tuicrSession))
    && nonEmpty(value.completionFile) && isOwnedCompletionFile(value.completionFile, ownerSessionId)
    && Array.isArray(value.accepted) && value.accepted.every(isAcceptedAnnotation) && value.delivered === false;
}

function isResourceIdentity(value: unknown): value is ResourceIdentity {
  return isRecord(value) && exactKeys(value, ["workspaceId", "tabId", "paneId"])
    && nonEmpty(value.workspaceId) && nonEmpty(value.tabId) && nonEmpty(value.paneId);
}

function isTuicrSessionIdentity(value: unknown): value is TuicrSessionIdentity {
  return isRecord(value) && exactKeys(value, ["slug", "path"])
    && nonEmpty(value.slug) && nonEmpty(value.path) && isAbsolute(value.path);
}

function isAcceptedAnnotation(value: unknown): value is AcceptedAnnotation {
  return isRecord(value) && exactKeys(value, ["fingerprint", "commentId"])
    && nonEmpty(value.fingerprint) && nonEmpty(value.commentId);
}

function isStatus(value: unknown): value is PersistedState["status"] {
  return value === "active" || value === "completed" || value === "failed" || value === "cancelled";
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function identityKey(item: TuicrSessionIdentity): string {
  return `${item.slug}\0${item.path}`;
}
