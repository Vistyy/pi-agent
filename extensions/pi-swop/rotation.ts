// ── pi-swop: rotation ─────────────────────────────────────────
// Per-request account selection + streaming wrapper with retry.

import type {
  AssistantMessageEventStream,
  Model,
  SimpleStreamOptions,
} from "@earendil-works/pi-ai";
import { createAssistantMessageEventStream } from "@earendil-works/pi-ai";
import { ensureToken } from "./state";
import { mergeAbortSignals } from "./logic";
import { MAX_RETRIES } from "./types";
import {
  isAuthErrorMessage,
  isQuotaErrorMessage,
  markAccountCooldown,
  markAccountUsed,
  messageFromThrown,
  pickAccount,
} from "./account-pool";

type CodexStream = (
  model: Model<any>,
  context: any,
  options?: SimpleStreamOptions,
) => AssistantMessageEventStream;

let _originalCodexStream: CodexStream = () => {
  throw new Error("swop: original stream not initialized");
};

export function setOriginalCodexStream(fn: CodexStream): void {
  _originalCodexStream = fn;
}

function pushError(
  stream: AssistantMessageEventStream,
  model: Model<any>,
  msg: string,
): void {
  stream.push({
    type: "error",
    reason: "error",
    error: {
      role: "assistant",
      content: [],
      api: model.api,
      provider: model.provider,
      model: model.id,
      usage: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 0,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
      stopReason: "error",
      errorMessage: msg,
      timestamp: Date.now(),
    },
  });
}

function endWithError(
  stream: AssistantMessageEventStream,
  model: Model<any>,
  msg: string,
): void {
  pushError(stream, model, msg);
  stream.end();
}

function anySignal(signals: AbortSignal[]): AbortSignal {
  return mergeAbortSignals(signals);
}

function getEventErrorMessage(event: unknown): string {
  const error = (event as { error?: { errorMessage?: string; message?: string } }).error;
  return error?.errorMessage ?? error?.message ?? "";
}

export function createRotatingStream(
  model: Model<"openai-codex-responses">,
  context: Parameters<CodexStream>[1],
  options?: SimpleStreamOptions,
): AssistantMessageEventStream {
  const stream = createAssistantMessageEventStream();

  void runRotatingStream(stream, model, context, options).catch((error) => {
    endWithError(stream, model, `swop: ${messageFromThrown(error)}`);
  });

  return stream;
}

async function runRotatingStream(
  stream: AssistantMessageEventStream,
  model: Model<"openai-codex-responses">,
  context: Parameters<CodexStream>[1],
  options?: SimpleStreamOptions,
): Promise<void> {
  const exclude = new Set<string>();

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const account = pickAccount(exclude);
    if (!account) {
      endWithError(stream, model, "swop: no available accounts");
      return;
    }

    let token: string;
    try {
      token = await ensureToken(account);
    } catch (error) {
      exclude.add(account.email);
      if (attempt >= MAX_RETRIES) {
        endWithError(stream, model, `swop: token refresh failed for ${account.email}: ${messageFromThrown(error)}`);
        return;
      }
      continue;
    }

    const abortController = new AbortController();
    const linkedSignal = options?.signal
      ? anySignal([options.signal, abortController.signal])
      : abortController.signal;

    let inner: AssistantMessageEventStream;
    try {
      inner = _originalCodexStream(model, context, {
        ...options,
        apiKey: token,
        signal: linkedSignal,
      });
    } catch (error) {
      markAccountCooldown(account);
      exclude.add(account.email);
      if (attempt < MAX_RETRIES) continue;
      endWithError(stream, model, messageFromThrown(error));
      return;
    }

    const result = await forwardInnerStream(stream, model, inner, attempt, abortController);
    if (result === "done") {
      markAccountUsed(account);
      stream.end();
      return;
    }
    if (result === "retry") {
      markAccountCooldown(account);
      exclude.add(account.email);
      continue;
    }
    if (result === "ended") {
      stream.end();
      return;
    }
    if (isAuthErrorMessage(result)) {
      markAccountCooldown(account);
      exclude.add(account.email);
      if (attempt < MAX_RETRIES) continue;
    }
    endWithError(stream, model, result);
    return;
  }

  endWithError(stream, model, "swop: all accounts failed after retries");
}

async function forwardInnerStream(
  stream: AssistantMessageEventStream,
  model: Model<"openai-codex-responses">,
  inner: AssistantMessageEventStream,
  attempt: number,
  abortController: AbortController,
): Promise<"done" | "retry" | "ended" | string> {
  let forwardedAny = false;

  try {
    for await (const event of inner) {
      if (event.type === "error") {
        const msg = getEventErrorMessage(event) || "provider error";
        if (isQuotaErrorMessage(msg) && !forwardedAny && attempt < MAX_RETRIES) {
          abortController.abort();
          return "retry";
        }
        return msg;
      }

      forwardedAny = true;
      stream.push(event);

      if (event.type === "done") return "done";
    }
  } catch (error) {
    const msg = messageFromThrown(error);
    if (!forwardedAny && attempt < MAX_RETRIES) return "retry";
    return msg;
  }

  return "ended";
}
