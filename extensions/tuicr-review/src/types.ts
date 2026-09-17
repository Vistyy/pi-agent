export type ReviewTarget =
  | { kind: "workingTree" }
  | { kind: "revisions"; revset: string; includeWorkingTree?: boolean };

export type Annotation =
  | { kind: "review"; content: string }
  | { kind: "file"; file: string; content: string }
  | { kind: "line"; file: string; line: number; side?: "old" | "new"; content: string }
  | {
      kind: "range";
      file: string;
      startLine: number;
      endLine: number;
      side?: "old" | "new";
      content: string;
    };

export interface ReviewInput {
  cwd?: string;
  target: ReviewTarget;
  annotations?: Annotation[];
}

export interface Comment {
  id: string;
  content: string;
  author?: string;
  location?: string;
  path?: string | null;
  start_line?: number | null;
  end_line?: number | null;
  side?: "old" | "new" | null;
}

export interface OwnedReview {
  targetKey: string;
  cwd: string;
  tabId: string;
  paneId: string;
  sessionId: string;
  dataHome: string;
  completionFile: string;
  accepted: Record<string, string>;
}

export interface ReviewFeedback {
  status: "completed" | "failed" | "cancelled";
  sessionId: string;
  seeded: Comment[];
  maintainer: Comment[];
  message?: string;
  cleanupWarnings?: string[];
}

export type PersistedReview =
  | { state: "active"; ownerSessionId: string; review: OwnedReview }
  | { state: "finished"; ownerSessionId: string; targetKey: string; deliveryId: string; feedback: ReviewFeedback }
  | { state: "cleared"; ownerSessionId: string; targetKey: string };
