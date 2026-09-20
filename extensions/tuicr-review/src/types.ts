export type Side = "old" | "new";

export type Annotation =
  | { kind: "review"; content: string }
  | { kind: "file"; file: string; content: string }
  | { kind: "line"; file: string; line: number; side?: Side; content: string }
  | { kind: "range"; file: string; startLine: number; endLine: number; side?: Side; content: string };

export interface ReviewInput {
  cwd?: string;
  base: string;
  head: string;
  replaceExisting: boolean;
  annotations?: Annotation[];
}

export interface ExactComparison {
  base: string;
  head: string;
}

export interface Comment {
  id: string;
  content: string;
  author?: string;
  location?: string;
  path?: string | null;
  start_line?: number | null;
  end_line?: number | null;
  side?: Side | null;
}

export interface Grounding {
  revision: string;
  side: Side;
  path: string;
  startLine: number;
  endLine: number;
  excerpt?: string;
  unresolved?: string;
}

export interface FeedbackComment extends Comment {
  grounding?: Grounding;
}

export interface OwnedReview extends ExactComparison {
  targetKey: string;
  cwd: string;
  tabId: string;
  paneId: string;
  sessionId: string;
  dataHome: string;
  completionFile: string;
  accepted: Record<string, string>;
}

export interface ReviewFeedback extends ExactComparison {
  status: "completed" | "failed" | "cancelled" | "replaced";
  sessionId: string;
  seeded: Comment[];
  maintainer: FeedbackComment[];
  message?: string;
  cleanupWarnings?: string[];
}

export type PersistedReview =
  | { state: "active"; ownerSessionId: string; review: OwnedReview }
  | { state: "finished"; ownerSessionId: string; targetKey: string; deliveryId: string; feedback: ReviewFeedback }
  | { state: "cleared"; ownerSessionId: string; targetKey: string };
