// ── pi-swop: usage ────────────────────────────────────────────
// Per-account usage fetching + status display.

import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { AccountUsage, PlanTier, UsageSnapshot, UsageWindow } from "./types";
import { STATUS_KEY } from "./types";
import { getAllAccounts, ensureToken, storage } from "./state";
import {
  parseWindow,
  getCombinedDisplay as buildCombinedDisplay,
  remaining,
  clamp,
} from "./logic";

const USAGE_URL = "https://chatgpt.com/backend-api/wham/usage";
const USAGE_TTL = 5 * 60 * 1000;
const USAGE_TIMEOUT = 15_000;

export let usageCache: {
  capturedAt: number;
  accounts: AccountUsage[];
} | null = null;

let statusTimer: ReturnType<typeof setTimeout> | undefined;

// ── fetch ──────────────────────────────────────────────────────

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
    // Normalize API variants: "prolite" → "pro-lite"
    const normalizedPlanType =
      planType === "prolite" ? "pro-lite" : planType;
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

// ── refresh all ───────────────────────────────────────────────

export async function refreshAllUsage(): Promise<void> {
  const results: AccountUsage[] = [];
  for (const acc of getAllAccounts()) {
    try {
      const token = await ensureToken(acc);
      const { planTier, fiveHour, sevenDay, snapshots } =
        await fetchUsageForAccount(token);
      results.push({ email: acc.email, planTier, fiveHour, sevenDay, snapshots });
    } catch {
      // Keep account visible; rotation may still try another refresh path later.
      results.push({
        email: acc.email,
        planTier: "unknown",
        fiveHour: null,
        sevenDay: null,
        snapshots: [],
      });
    }
  }
  usageCache = { capturedAt: Date.now(), accounts: results };
}

// ── display ────────────────────────────────────────────────────

export function getCombinedDisplay(modelKeys: Array<string | undefined> = []): string | null {
  if (!usageCache) return null;
  return buildCombinedDisplay(usageCache.accounts, modelKeys);
}

// re-export for callers that need raw functions
export { remaining, clamp };

// ── status integration ────────────────────────────────────────

export function clearUsageCache(): void {
  usageCache = null;
}

export function updateStatus(ctx: ExtensionContext): void {
  if (statusTimer) clearTimeout(statusTimer);

  if (ctx.model?.provider !== "openai-codex") {
    clearStatus(ctx);
    return;
  }

  const display = getCombinedDisplay([ctx.model?.id, ctx.model?.name]);
  if (display) {
    ctx.ui.setStatus(STATUS_KEY, ctx.ui.theme.fg("accent", display));
  } else {
    ctx.ui.setStatus(STATUS_KEY, ctx.ui.theme.fg("dim", "Codex …"));
  }

  statusTimer = setTimeout(() => {
    if (ctx.model?.provider !== "openai-codex") {
      clearStatus(ctx);
      return;
    }
    refreshAllUsage()
      .then(() => updateStatus(ctx))
      .catch(() =>
        ctx.ui.setStatus(
          STATUS_KEY,
          ctx.ui.theme.fg("warning", "Codex err"),
        ),
      );
  }, USAGE_TTL);
  statusTimer.unref?.();
}

export function clearStatus(ctx: ExtensionContext): void {
  if (statusTimer) clearTimeout(statusTimer);
  statusTimer = undefined;
  ctx.ui.setStatus(STATUS_KEY, undefined);
}
