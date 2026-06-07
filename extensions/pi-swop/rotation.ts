// ── pi-swop: rotation ─────────────────────────────────────────
// Per-request account selection + streaming wrapper with retry.

import type {
  AssistantMessageEventStream,
  Model,
  SimpleStreamOptions,
} from "@earendil-works/pi-ai";
import { createAssistantMessageEventStream } from "@earendil-works/pi-ai";
import {
  getAllAccounts,
  getAccount,
  ensureToken,
  isPiAuth,
  saveStorage,
} from "./state";
import { usageCache, clamp } from "./usage";
import { mergeAbortSignals, rankAccounts } from "./logic";
import { COOLDOWN_MS, MAX_RETRIES, PLAN_MULTIPLIERS } from "./types";

// Set by index.ts before registering provider override
let _originalCodexStream: (
  model: Model<any>,
  context: any,
  options?: SimpleStreamOptions,
) => AssistantMessageEventStream = () => {
  throw new Error("swop: original stream not initialized");
};

export function setOriginalCodexStream(
  fn: typeof _originalCodexStream,
): void {
  _originalCodexStream = fn;
}

// ── selection ──────────────────────────────────────────────────

function pickAccount(exclude: Set<string>) {
  const now = Date.now();

  const accounts = getAllAccounts().filter(
    (a) => !exclude.has(a.email) && a.cooldownUntil < now,
  );
  if (accounts.length === 0) return null;

  const scored = accounts.map((acc) => {
    const u = usageCache?.accounts.find((a) => a.email === acc.email);
    const mult = PLAN_MULTIPLIERS[u?.planTier ?? "unknown"];
    return {
      email: acc.email,
      fiveHourRemaining: u?.fiveHour
        ? (100 - clamp(u.fiveHour.usedPercent)) * mult
        : 0,
      sevenDayRemaining: u?.sevenDay
        ? (100 - clamp(u.sevenDay.usedPercent)) * mult
        : 0,
      lastUsed: acc.lastUsed,
    };
  });

  const ranked = rankAccounts(scored);
  return getAccount(ranked[0].email);
}

// ── helpers ────────────────────────────────────────────────────

function pushError(
  stream: AssistantMessageEventStream,
  model: Model<any>,
  msg: string,
) {
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
        input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
      stopReason: "error",
      errorMessage: msg,
      timestamp: Date.now(),
    },
  });
}

function anySignal(signals: AbortSignal[]): AbortSignal {
  return mergeAbortSignals(signals);
}

// ── stream wrapper ─────────────────────────────────────────────

export function createRotatingStream(
  model: Model<"openai-codex-responses">,
  context: Parameters<typeof _originalCodexStream>[1],
  options?: SimpleStreamOptions,
): AssistantMessageEventStream {
  const stream = createAssistantMessageEventStream();

  (async () => {
    const exclude = new Set<string>();

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const account = pickAccount(exclude);
      if (!account) {
        pushError(stream, model,
          "swop: no available accounts (all exhausted or on cooldown)");
        stream.end();
        return;
      }

      let token: string;
      try { token = await ensureToken(account); }
      catch { exclude.add(account.email); continue; }

      const abortController = new AbortController();
      const linkedSignal = options?.signal
        ? anySignal([options.signal, abortController.signal])
        : abortController.signal;

      const inner = _originalCodexStream(model, context, {
        ...options,
        apiKey: token,
        signal: linkedSignal,
      });

      let forwardedAny = false;
      let retry = false;

      try {
        for await (const event of inner) {
          if (event.type === "error") {
            const msg =
              (event.error as { errorMessage?: string }).errorMessage ?? "";
            const isQuota = /rate.?limit|quota|too many requests|429/i.test(msg);

            if (isQuota && !forwardedAny && attempt < MAX_RETRIES) {
              account.cooldownUntil = Date.now() + COOLDOWN_MS;
              if (!isPiAuth(account)) saveStorage().catch(() => {});
              exclude.add(account.email);
              abortController.abort();
              retry = true;
              break;
            }

            stream.push(event);
            stream.end();
            return;
          }

          forwardedAny = true;
          stream.push(event);

          if (event.type === "done") {
            account.lastUsed = Date.now();
            stream.end();
            return;
          }
        }
      } catch (err) {
        if (!forwardedAny && attempt < MAX_RETRIES) {
          account.cooldownUntil = Date.now() + COOLDOWN_MS;
          if (!isPiAuth(account)) saveStorage().catch(() => {});
          exclude.add(account.email);
          retry = true;
        } else {
          throw err;
        }
      }

      if (retry) continue;
      stream.end();
      return;
    }

    pushError(stream, model,
      "swop: all accounts rate-limited after retries");
    stream.end();
  })();

  return stream;
}
