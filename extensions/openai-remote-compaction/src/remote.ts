import type { Usage } from "@earendil-works/pi-ai";
import { RESPONSES_URL } from "./constants.js";
import type { RemoteCompactionResult, ResponseItem } from "./types.js";

const AUTH_CLAIM = "https://api.openai.com/auth";

export function extractAccountId(token: string): string {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) throw new Error("invalid token");
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as Record<
      string,
      unknown
    >;
    const auth = payload[AUTH_CLAIM] as Record<string, unknown> | undefined;
    if (typeof auth?.chatgpt_account_id !== "string") throw new Error("missing account ID");
    return auth.chatgpt_account_id;
  } catch {
    throw new Error("Failed to extract the ChatGPT account ID from Codex OAuth");
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : undefined;
}

function compactionItem(value: unknown): ResponseItem | undefined {
  const item = asRecord(value);
  return item?.type === "compaction" && typeof item.encrypted_content === "string"
    ? item
    : undefined;
}

function normalizeUsage(value: unknown): Usage | undefined {
  const usage = asRecord(value);
  if (!usage) return undefined;
  const inputTotal = typeof usage.input_tokens === "number" ? usage.input_tokens : 0;
  const inputDetails = asRecord(usage.input_tokens_details);
  const cacheRead = typeof inputDetails?.cached_tokens === "number" ? inputDetails.cached_tokens : 0;
  const output = typeof usage.output_tokens === "number" ? usage.output_tokens : 0;
  const totalTokens =
    typeof usage.total_tokens === "number" ? usage.total_tokens : inputTotal + output;
  return {
    input: Math.max(0, inputTotal - cacheRead),
    output,
    cacheRead,
    cacheWrite: 0,
    totalTokens,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  };
}

function parseSSE(text: string): Array<Record<string, unknown>> {
  const events: Array<Record<string, unknown>> = [];
  for (const block of text.split(/\r?\n\r?\n/)) {
    const data = block
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .join("\n");
    if (!data || data === "[DONE]") continue;
    try {
      const parsed = JSON.parse(data);
      if (parsed && typeof parsed === "object") events.push(parsed as Record<string, unknown>);
    } catch {
      throw new Error("OpenAI returned invalid remote compaction SSE JSON");
    }
  }
  return events;
}

class RemoteApplicationError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "RemoteApplicationError";
  }
}

type FailureDisposition = "terminal" | "retryable" | "unknown";

function classifyFailure(identifiers: unknown, message: string): FailureDisposition {
  const values = Array.isArray(identifiers) ? identifiers : [identifiers];
  const text = `${values.filter((value): value is string => typeof value === "string").join(" ")} ${message}`;
  if (
    /auth|unauthorized|forbidden|access.?denied|permission.?denied|invalid|token.?expired|usage_limit|usage_not_included|GoUsageLimitError|FreeUsageLimitError|Monthly usage limit|available balance|insufficient_quota|out of budget|billing|quota exceeded/i.test(
      text,
    )
  ) {
    return "terminal";
  }
  if (
    /rate.?limit|overloaded|server|internal.?error|service.?unavailable|upstream|temporar|connection.?refused/i.test(
      text,
    )
  ) {
    return "retryable";
  }
  return "unknown";
}

function applicationError(identifiers: unknown, message: string): RemoteApplicationError {
  return new RemoteApplicationError(
    message,
    classifyFailure(identifiers, message) === "retryable",
  );
}

function parseRemoteResponse(text: string): RemoteCompactionResult {
  let streamedItem: ResponseItem | undefined;
  let completedItem: ResponseItem | undefined;
  let usage: Usage | undefined;

  for (const event of parseSSE(text)) {
    if (event.type === "error") {
      const nested = asRecord(event.error);
      const message =
        typeof event.message === "string"
          ? event.message
          : typeof nested?.message === "string"
            ? nested.message
            : "OpenAI remote compaction failed";
      throw applicationError([event.code, nested?.code, nested?.type], message);
    }
    if (event.type === "response.failed") {
      const response = asRecord(event.response);
      const error = asRecord(response?.error);
      const message =
        typeof error?.message === "string" ? error.message : "OpenAI remote compaction failed";
      throw applicationError([error?.code, error?.type], message);
    }
    if (event.type === "response.output_item.done") {
      streamedItem = compactionItem(event.item) ?? streamedItem;
    }
    if (
      event.type === "response.completed" ||
      event.type === "response.done" ||
      event.type === "response.incomplete"
    ) {
      const response = asRecord(event.response);
      const output = Array.isArray(response?.output) ? response.output : [];
      const items = output.map(compactionItem).filter((item): item is ResponseItem => item !== undefined);
      if (items.length > 1) throw new Error("OpenAI returned multiple remote checkpoints");
      completedItem = items[0];
      usage = normalizeUsage(response?.usage);
    }
  }

  const item = completedItem ?? streamedItem;
  if (!item) throw new Error("OpenAI did not return a remote checkpoint");
  return { replacementHistory: [item], ...(usage ? { usage } : {}) };
}

async function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) throw new Error("Remote compaction was aborted");
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(resolve, ms);
    const abort = () => {
      clearTimeout(timeout);
      reject(new Error("Remote compaction was aborted"));
    };
    signal?.addEventListener("abort", abort, { once: true });
  });
}

function retryDelay(headers: Headers, attempt: number): number {
  const milliseconds = headers.get("retry-after-ms");
  if (milliseconds !== null && Number.isFinite(Number(milliseconds))) {
    return Math.max(0, Number(milliseconds));
  }
  const retryAfter = headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
    const date = Date.parse(retryAfter);
    if (!Number.isNaN(date)) return Math.max(0, date - Date.now());
  }
  return 1000 * 2 ** attempt;
}

function responseFailure(body: string): { identifiers: unknown[]; message: string } {
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    const error = asRecord(parsed.error);
    return {
      identifiers: [error?.code, error?.type],
      message: typeof error?.message === "string" ? error.message : body,
    };
  } catch {
    return { identifiers: [], message: body };
  }
}

function retryableResponse(status: number, body: string): boolean {
  const failure = responseFailure(body);
  const disposition = classifyFailure(failure.identifiers, failure.message);
  if (disposition === "terminal") return false;
  if (disposition === "retryable") return true;
  return status === 429 || (status >= 500 && status <= 599);
}

export interface RemoteCompactionRequestOptions {
  fetch?: typeof globalThis.fetch;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  token: string;
  authHeaders?: Record<string, string | null>;
  body: Record<string, unknown>;
  signal?: AbortSignal;
  sessionId?: string;
}

export async function requestRemoteCompaction(
  options: RemoteCompactionRequestOptions,
): Promise<RemoteCompactionResult> {
  const headers: Record<string, string> = {
    Accept: "text/event-stream",
    "Content-Type": "application/json",
    Authorization: `Bearer ${options.token}`,
    "chatgpt-account-id": extractAccountId(options.token),
    originator: "pi",
    "OpenAI-Beta": "responses=experimental",
    "x-codex-beta-features": "remote_compaction_v2",
  };
  for (const [key, value] of Object.entries(options.authHeaders ?? {})) {
    if (value === null) delete headers[key];
    else headers[key] = value;
  }
  if (options.sessionId) {
    headers["session-id"] = options.sessionId;
    headers["x-client-request-id"] = options.sessionId;
  }

  const fetch = options.fetch ?? globalThis.fetch;
  const sleep = options.sleep ?? abortableSleep;
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (options.signal?.aborted) throw new Error("Remote compaction was aborted");
    try {
      const response = await fetch(RESPONSES_URL, {
        method: "POST",
        headers,
        body: JSON.stringify(options.body),
        signal: options.signal,
      });
      const text = await response.text();
      if (response.ok) return parseRemoteResponse(text);

      lastError = new Error(
        `OpenAI remote compaction failed (${response.status}): ${text || response.statusText}`,
      );
      if (attempt === 2 || !retryableResponse(response.status, text)) throw lastError;
      await sleep(retryDelay(response.headers, attempt), options.signal);
    } catch (error) {
      if (options.signal?.aborted) throw new Error("Remote compaction was aborted");
      if (error === lastError) throw error;
      lastError = error instanceof Error ? error : new Error(String(error));
      if (lastError instanceof RemoteApplicationError && !lastError.retryable) throw lastError;
      if (attempt === 2) throw lastError;
      await sleep(1000 * 2 ** attempt, options.signal);
    }
  }

  throw lastError ?? new Error("OpenAI remote compaction failed");
}
