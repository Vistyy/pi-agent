import type { ExecResult, ExtensionAPI } from "@earendil-works/pi-coding-agent";

export type PullRequestLifecycle = "OPEN" | "MERGED" | "CLOSED";
export type PullRequestMergeability = "MERGEABLE" | "CONFLICTING" | "UNKNOWN";

export interface PullRequestTarget {
  readonly host: string;
  readonly owner: string;
  readonly repository: string;
  readonly number: number;
  readonly url: string;
}

export interface FailedCheck {
  readonly key: string;
  readonly name: string;
  readonly url?: string;
}

export interface CheckSummary {
  readonly total: number;
  readonly passed: number;
  readonly pending: number;
  readonly failed: readonly FailedCheck[];
  readonly settled: boolean;
}

export interface PullRequestSnapshot {
  readonly target: PullRequestTarget;
  readonly authorLogin: string;
  readonly lifecycle: PullRequestLifecycle;
  readonly headRefOid: string;
  readonly mergeability: PullRequestMergeability;
  readonly checks: CheckSummary;
}

export type PullRequestQueryFailureKind = "authentication" | "missing-gh" | "not-found" | "not-owned" | "invalid" | "transient";

export type PullRequestQueryResult =
  | { readonly ok: true; readonly snapshot: PullRequestSnapshot }
  | {
      readonly ok: false;
      readonly kind: PullRequestQueryFailureKind;
      readonly message: string;
    };

const GH_TIMEOUT_MS = 15_000;
const GH_PR_FIELDS = [
  "number",
  "url",
  "author",
  "state",
  "headRefOid",
  "mergeable",
  "statusCheckRollup",
].join(",");

interface JsonRecord {
  readonly [key: string]: unknown;
}

export function parsePullRequestUrl(value: string): PullRequestTarget | undefined {
  let url: URL;

  try {
    url = new URL(value.trim());
  } catch {
    return undefined;
  }

  if (url.protocol !== "https:") return undefined;
  const match = /^\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/pull\/(\d+)\/?$/.exec(url.pathname);
  if (!match) return undefined;

  const number = Number(match[3]);
  if (!Number.isSafeInteger(number) || number <= 0) return undefined;

  const owner = match[1]!;
  const repository = match[2]!;
  const canonical = `https://${url.host}/${owner}/${repository}/pull/${number}`;

  return { host: url.host, owner, repository, number, url: canonical };
}

export function pullRequestKey(target: PullRequestTarget): string {
  return `${target.host}/${target.owner}/${target.repository}#${target.number}`.toLowerCase();
}

export function normalizePullRequest(
  requested: PullRequestTarget,
  value: unknown,
): PullRequestSnapshot | undefined {
  const document = record(value);
  const returnedTarget = typeof document.url === "string"
    ? parsePullRequestUrl(document.url)
    : undefined;
  const target = returnedTarget ?? requested;
  const lifecycle = pullRequestLifecycle(document.state);
  const mergeability = pullRequestMergeability(document.mergeable);
  const authorLogin = record(document.author).login;

  if (!lifecycle || !mergeability || typeof authorLogin !== "string" || !authorLogin) return undefined;

  return {
    target,
    authorLogin,
    lifecycle,
    headRefOid: typeof document.headRefOid === "string" ? document.headRefOid : "",
    mergeability,
    checks: summarizeChecks(document.statusCheckRollup),
  };
}

export async function queryOwnedPullRequest(
  pi: Pick<ExtensionAPI, "exec">,
  input: string,
  signal?: AbortSignal,
): Promise<PullRequestQueryResult> {
  const target = parsePullRequestUrl(input);
  if (!target) {
    return { ok: false, kind: "invalid", message: "Expected an HTTPS GitHub pull-request URL." };
  }

  const [pullRequest, viewer] = await Promise.all([
    queryPullRequest(pi, target.url, signal),
    queryAuthenticatedLogin(pi, target.host, signal),
  ]);
  if (!pullRequest.ok) return pullRequest;
  if (!viewer.ok) return viewer;

  if (pullRequest.snapshot.authorLogin.toLowerCase() !== viewer.login.toLowerCase()) {
    return {
      ok: false,
      kind: "not-owned",
      message: `Authenticated GitHub account ${viewer.login} did not author ${pullRequest.snapshot.target.url}.`,
    };
  }

  return pullRequest;
}

export async function queryPullRequest(
  pi: Pick<ExtensionAPI, "exec">,
  input: string,
  signal?: AbortSignal,
): Promise<PullRequestQueryResult> {
  const target = parsePullRequestUrl(input);
  if (!target) {
    return { ok: false, kind: "invalid", message: "Expected an HTTPS GitHub pull-request URL." };
  }

  const execution = await executeGh(
    pi,
    ["pr", "view", target.url, "--json", GH_PR_FIELDS],
    "query the pull request",
    signal,
  );
  if (!execution.ok) return execution;

  try {
    const { result } = execution;
    const snapshot = normalizePullRequest(target, JSON.parse(result.stdout));
    return snapshot
      ? { ok: true, snapshot }
      : { ok: false, kind: "invalid", message: "GitHub returned an invalid pull-request snapshot." };
  } catch (error) {
    return {
      ok: false,
      kind: "invalid",
      message: `Could not parse GitHub pull-request state: ${errorMessage(error)}`,
    };
  }
}

type LoginQueryResult =
  | { readonly ok: true; readonly login: string }
  | { readonly ok: false; readonly kind: PullRequestQueryFailureKind; readonly message: string };

async function queryAuthenticatedLogin(
  pi: Pick<ExtensionAPI, "exec">,
  host: string,
  signal?: AbortSignal,
): Promise<LoginQueryResult> {
  const execution = await executeGh(
    pi,
    ["api", "--hostname", host, "user", "--jq", ".login"],
    "read the authenticated GitHub account",
    signal,
  );
  if (!execution.ok) return execution;

  const login = execution.result.stdout.trim();
  return login
    ? { ok: true, login }
    : { ok: false, kind: "invalid", message: "GitHub returned an empty authenticated account login." };
}

type GhExecutionResult =
  | { readonly ok: true; readonly result: ExecResult }
  | Exclude<PullRequestQueryResult, { readonly ok: true }>;

async function executeGh(
  pi: Pick<ExtensionAPI, "exec">,
  args: readonly string[],
  operation: string,
  signal?: AbortSignal,
): Promise<GhExecutionResult> {
  let result: ExecResult;

  try {
    result = await pi.exec("gh", [...args], { signal, timeout: GH_TIMEOUT_MS });
  } catch (error) {
    const detail = errorMessage(error);
    const missing = isMissingExecutable(detail);
    return {
      ok: false,
      kind: missing ? "missing-gh" : "transient",
      message: missing
        ? "GitHub CLI is unavailable. Install gh and run: gh auth login."
        : `Could not ${operation}: ${detail}`,
    };
  }

  if (result.killed) {
    return { ok: false, kind: "transient", message: `GitHub could not ${operation} before its deadline.` };
  }
  return result.code === 0 ? { ok: true, result } : classifyGhFailure(result);
}

function summarizeChecks(value: unknown): CheckSummary {
  const checks = Array.isArray(value) ? value : [];
  const failed: FailedCheck[] = [];
  let passed = 0;
  let pending = 0;

  for (let index = 0; index < checks.length; index += 1) {
    const check = record(checks[index]);
    const name = checkName(check, index);
    const url = checkUrl(check);
    const state = checkState(check);

    if (state === "passed") passed += 1;
    else if (state === "pending") pending += 1;
    else failed.push({ key: `${name}\u0000${url ?? ""}`, name, ...(url ? { url } : {}) });
  }

  failed.sort((left, right) => left.key.localeCompare(right.key));

  return {
    total: checks.length,
    passed,
    pending,
    failed,
    settled: pending === 0,
  };
}

function checkState(check: JsonRecord): "passed" | "pending" | "failed" {
  const state = upper(check.state);
  const status = upper(check.status);
  const conclusion = upper(check.conclusion);

  if (state === "SUCCESS") return "passed";
  if (state === "FAILURE" || state === "ERROR") return "failed";
  if (state === "PENDING" || state === "EXPECTED") return "pending";

  if (status && status !== "COMPLETED") return "pending";
  if (["SUCCESS", "SKIPPED", "NEUTRAL"].includes(conclusion)) return "passed";
  if (
    [
      "FAILURE",
      "CANCELLED",
      "TIMED_OUT",
      "ACTION_REQUIRED",
      "STARTUP_FAILURE",
      "STALE",
      "ERROR",
    ].includes(conclusion)
  ) {
    return "failed";
  }

  return "pending";
}

function checkName(check: JsonRecord, index: number): string {
  for (const value of [check.name, check.context, check.workflowName]) {
    if (typeof value === "string" && value.trim()) return value.trim().slice(0, 200);
  }

  return `check-${index + 1}`;
}

function checkUrl(check: JsonRecord): string | undefined {
  for (const value of [check.detailsUrl, check.targetUrl]) {
    if (typeof value !== "string") continue;

    try {
      const url = new URL(value);
      if (url.protocol === "https:" || url.protocol === "http:") return url.toString();
    } catch {
      // Ignore invalid remote metadata.
    }
  }

  return undefined;
}

function pullRequestLifecycle(value: unknown): PullRequestLifecycle | undefined {
  return value === "OPEN" || value === "MERGED" || value === "CLOSED" ? value : undefined;
}

function pullRequestMergeability(value: unknown): PullRequestMergeability | undefined {
  return value === "MERGEABLE" || value === "CONFLICTING" || value === "UNKNOWN"
    ? value
    : undefined;
}

function classifyGhFailure(
  result: ExecResult,
): Exclude<PullRequestQueryResult, { readonly ok: true }> {
  const output = `${result.stderr}\n${result.stdout}`.trim();
  const lower = output.toLowerCase();

  if (isMissingExecutable(lower)) {
    return {
      ok: false,
      kind: "missing-gh",
      message: "GitHub CLI is unavailable. Install gh and run: gh auth login.",
    };
  }
  if (/not logged in|authentication|auth login|gh auth|http 401|http 403/.test(lower)) {
    return {
      ok: false,
      kind: "authentication",
      message: "GitHub CLI authentication failed. Run: gh auth login.",
    };
  }
  if (/could not resolve|not found|no pull requests/.test(lower)) {
    return { ok: false, kind: "not-found", message: output || "Pull request was not found." };
  }

  return {
    ok: false,
    kind: "transient",
    message: output || `GitHub CLI failed with exit code ${result.code}.`,
  };
}

function isMissingExecutable(message: string): boolean {
  return /\bgh\b.*\benoent\b|\benoent\b.*\bgh\b|\bgh: (?:command )?not found\b|\bgh: no such file or directory\b/i.test(
    message,
  );
}

function upper(value: unknown): string {
  return typeof value === "string" ? value.toUpperCase() : "";
}

function record(value: unknown): JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
