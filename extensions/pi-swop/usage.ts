// ── pi-swop: usage ────────────────────────────────────────────
// Per-account usage fetching + status display.

import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { Account, AccountUsage, PlanTier, UsageSnapshot, UsageWindow } from "./types";
import { STATUS_KEY } from "./types";
import { getAllAccounts, ensureToken } from "./state";
import {
  parseWindow,
  getCombinedDisplay as buildCombinedDisplay,
  remaining,
  clamp,
} from "./logic";

const USAGE_URL = "https://chatgpt.com/backend-api/wham/usage";
const USAGE_TTL = 5 * 60 * 1000;
const USAGE_TIMEOUT = 15_000;
const USAGE_CONCURRENCY = 4;

export let usageCache: {
  capturedAt: number;
  accounts: AccountUsage[];
} | null = null;

let statusTimer: ReturnType<typeof setTimeout> | undefined;
let statusGeneration = 0;

async function fetchUsageForAccount(
  accessToken: string,
): Promise<{
  planTier: PlanTier;
  fiveHour: UsageWindow | null;
  sevenDay: UsageWindow | null;
  snapshots: UsageSnapshot[];
}> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), USAGE_TIMEOUT);
  try {
    const res = await fetch(USAGE_URL, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "User-Agent": "pi-swop",
      },
      signal: controller.signal,
    });
    if (!res.ok) {
      return { planTier: "unknown", fiveHour: null, sevenDay: null, snapshots: [] };
    }
    const json = (await res.json()) as Record<string, unknown>;

    const planType = (json.plan_type as string) ?? "unknown";
    const normalizedPlanType = planType === "prolite" ? "pro-lite" : planType;
    const planTier: PlanTier =
      normalizedPlanType === "free" || normalizedPlanType === "plus" ||
      normalizedPlanType === "pro-lite" || normalizedPlanType === "pro"
        ? normalizedPlanType
        : "unknown";

    const snapshots = parseUsageSnapshots(json);
    const selected = snapshots[0];
    return {
      planTier,
      fiveHour: selected?.fiveHour ?? null,
      sevenDay: selected?.sevenDay ?? null,
      snapshots,
    };
  } catch {
    return { planTier: "unknown", fiveHour: null, sevenDay: null, snapshots: [] };
  } finally {
    clearTimeout(timeout);
  }
}

function parseUsageSnapshots(json: Record<string, unknown>): UsageSnapshot[] {
  const out: UsageSnapshot[] = [];
  const base = parseLimit("codex", undefined, json.rate_limit);
  if (base) out.push(base);

  const additional = Array.isArray(json.additional_rate_limits)
    ? json.additional_rate_limits
    : [];
  for (const raw of additional) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const item = raw as Record<string, unknown>;
    const id = asString(item.metered_feature) ?? asString(item.limit_name);
    if (!id) continue;
    const snapshot = parseLimit(id, asString(item.limit_name), item.rate_limit);
    if (snapshot) out.push(snapshot);
  }

  return out;
}

function parseLimit(
  id: string,
  name: string | undefined,
  raw: unknown,
): UsageSnapshot | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const limit = raw as Record<string, unknown>;
  const fiveHour = parseWindow(limit.primary_window);
  const sevenDay = parseWindow(limit.secondary_window);
  if (!fiveHour && !sevenDay) return null;
  return { id, name, fiveHour, sevenDay };
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export async function refreshAllUsage(): Promise<void> {
  const accounts = getAllAccounts();
  const results: AccountUsage[] = [];
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < accounts.length) {
      const account = accounts[nextIndex++];
      results.push(await fetchAccountUsage(account));
    }
  }

  const workers = Array.from(
    { length: Math.min(USAGE_CONCURRENCY, Math.max(accounts.length, 1)) },
    () => worker(),
  );
  await Promise.all(workers);
  usageCache = { capturedAt: Date.now(), accounts: results };
}

async function fetchAccountUsage(account: Account): Promise<AccountUsage> {
  try {
    const token = await ensureToken(account);
    const { planTier, fiveHour, sevenDay, snapshots } = await fetchUsageForAccount(token);
    return { email: account.email, planTier, fiveHour, sevenDay, snapshots };
  } catch {
    return {
      email: account.email,
      planTier: "unknown",
      fiveHour: null,
      sevenDay: null,
      snapshots: [],
    };
  }
}

export function getCombinedDisplay(modelKeys: Array<string | undefined> = []): string | null {
  if (!usageCache) return null;
  return buildCombinedDisplay(usageCache.accounts, modelKeys);
}

export { remaining, clamp };

export function clearUsageCache(): void {
  usageCache = null;
}

export function refreshUsageInBackground(ctx: ExtensionContext): void {
  const generation = statusGeneration;
  void refreshAllUsage()
    .then(() => {
      if (generation === statusGeneration) updateStatus(ctx);
    })
    .catch(() => {
      if (generation === statusGeneration) setStatusText(ctx, "warning", "Codex err");
    });
}

export function updateStatus(ctx: ExtensionContext): void {
  const generation = ++statusGeneration;
  if (statusTimer) clearTimeout(statusTimer);

  if (getProvider(ctx) !== "openai-codex") {
    clearStatus(ctx);
    return;
  }

  const model = getModel(ctx);
  const display = getCombinedDisplay([model?.id, model?.name]);
  if (display) {
    setStatusText(ctx, "accent", display);
  } else {
    setStatusText(ctx, "dim", "Codex …");
  }

  statusTimer = setTimeout(() => {
    if (generation !== statusGeneration) return;
    if (getProvider(ctx) !== "openai-codex") {
      clearStatus(ctx);
      return;
    }
    void refreshAllUsage()
      .then(() => {
        if (generation === statusGeneration) updateStatus(ctx);
      })
      .catch(() => {
        if (generation === statusGeneration) setStatusText(ctx, "warning", "Codex err");
      });
  }, USAGE_TTL);
  statusTimer.unref?.();
}

export function clearStatus(ctx: ExtensionContext): void {
  statusGeneration++;
  if (statusTimer) clearTimeout(statusTimer);
  statusTimer = undefined;
  try {
    ctx.ui.setStatus(STATUS_KEY, undefined);
  } catch {}
}

function getModel(ctx: ExtensionContext) {
  try {
    return ctx.model;
  } catch {
    return undefined;
  }
}

function getProvider(ctx: ExtensionContext): string | undefined {
  return getModel(ctx)?.provider;
}

function setStatusText(
  ctx: ExtensionContext,
  color: "accent" | "dim" | "warning",
  text: string,
): void {
  try {
    ctx.ui.setStatus(STATUS_KEY, ctx.ui.theme.fg(color, text));
  } catch {}
}
