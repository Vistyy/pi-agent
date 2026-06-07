// ── pi-swop: pure logic ───────────────────────────────────────
// Zero pi dependencies. Importable from tests.

import type { AccountUsage, PlanTier, UsageWindow } from "./types";
import { PLAN_MULTIPLIERS } from "./types";

// ── JWT decode ────────────────────────────────────────────────

export function decodeEmail(accessToken: string): string | undefined {
  try {
    const parts = accessToken.split(".");
    if (parts.length !== 3) return undefined;
    const payload = Buffer.from(
      parts[1].replace(/-/g, "+").replace(/_/g, "/"),
      "base64",
    ).toString("utf8");
    const obj = JSON.parse(payload) as Record<string, unknown>;
    const auth = obj["https://api.openai.com/auth"] as
      | Record<string, unknown>
      | undefined;
    const accountId = auth?.chatgpt_account_id;
    if (typeof accountId === "string" && accountId) return `codex-${accountId}`;

    const profile = obj["https://api.openai.com/profile"] as
      | Record<string, unknown>
      | undefined;
    const email = profile?.email;
    return typeof email === "string" ? email : undefined;
  } catch {
    return undefined;
  }
}

// ── usage parsing ─────────────────────────────────────────────

export function parseWindow(raw: unknown): UsageWindow | null {
  if (!raw || typeof raw !== "object") return null;
  const w = raw as Record<string, unknown>;
  const usedPercent =
    typeof w.used_percent === "number"
      ? w.used_percent
      : typeof w.used_percent === "string"
        ? Number(w.used_percent)
        : undefined;
  if (usedPercent === undefined || !Number.isFinite(usedPercent))
    return null;
  return { usedPercent, resetAt: resolveResetAt(w) };
}

export function resolveResetAt(
  w: Record<string, unknown>,
): number | undefined {
  const absolute =
    asTimestamp(w.reset_at) ??
    asTimestamp(w.resets_at) ??
    asTimestamp(w.reset_time) ??
    asTimestamp(w.end_time) ??
    asTimestamp(w.ends_at);
  if (absolute !== undefined) return absolute;

  const seconds =
    asNumber(w.resets_after_seconds) ??
    asNumber(w.reset_after_seconds) ??
    asNumber(w.seconds_until_reset);
  return seconds !== undefined ? Date.now() + seconds * 1000 : undefined;
}

// ── numeric coercion ──────────────────────────────────────────

export function asNumber(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

export function asTimestamp(v: unknown): number | undefined {
  const n = asNumber(v);
  if (n === undefined) return undefined;
  return n < 10_000_000_000 ? n * 1000 : n;
}

// ── display helpers ───────────────────────────────────────────

/** Effective remaining % after adjusting for plan tier multiplier. */
export function effectiveRemaining(w: UsageWindow, tier: PlanTier): number {
  const rawRemaining = 100 - clamp(w.usedPercent);
  return rawRemaining * PLAN_MULTIPLIERS[tier];
}

/** Raw remaining % (without plan multiplier). */
export function remaining(w: UsageWindow): string {
  return String(Math.round(100 - clamp(w.usedPercent)));
}

export function clamp(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.min(100, Math.max(0, v));
}

export function truncateEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return email.slice(0, 16);
  const user = email.slice(0, at);
  const domain = email.slice(at);
  const visible = 16 - domain.length;
  return visible > 2
    ? user.slice(0, visible) + domain
    : email.slice(0, 16);
}

/** Format a reset timestamp as relative + absolute. */
export function formatResetTime(ts: number | undefined): string {
  if (!ts) return "?";
  const now = Date.now();
  const diff = ts - now;
  if (diff <= 0) return `${new Date(ts).toLocaleDateString()} (now)`;

  const mins = Math.round(diff / 60_000);
  const hrs = Math.floor(mins / 60);
  const rmins = mins % 60;

  let rel: string;
  if (hrs > 24) {
    const days = Math.floor(hrs / 24);
    rel = `${days}d ${hrs % 24}h`;
  } else if (hrs > 0) {
    rel = `${hrs}h ${rmins}m`;
  } else {
    rel = `${mins}m`;
  }
  return `${rel} (${new Date(ts).toLocaleDateString()})`;
}

// ── combined display ──────────────────────────────────────────

export function getCombinedDisplay(
  accounts: AccountUsage[],
  modelKeys: Array<string | undefined> = [],
): string | null {
  if (accounts.length === 0) return null;

  let total5H = 0;
  let total7D = 0;
  let hasData = false;
  for (const a of accounts) {
    const selected = selectSnapshot(a, modelKeys);
    const fiveHour = selected?.fiveHour ?? a.fiveHour;
    const sevenDay = selected?.sevenDay ?? a.sevenDay;
    const mult = PLAN_MULTIPLIERS[a.planTier];
    if (fiveHour) {
      total5H += (100 - clamp(fiveHour.usedPercent)) * mult;
      hasData = true;
    }
    if (sevenDay) {
      total7D += (100 - clamp(sevenDay.usedPercent)) * mult;
      hasData = true;
    }
  }
  if (!hasData) return null;

  return `Codex 5H ${Math.round(total5H)}% 7D ${Math.round(total7D)}%`;
}

function selectSnapshot(
  account: AccountUsage,
  modelKeys: Array<string | undefined>,
) {
  const snapshots = account.snapshots ?? [];
  if (snapshots.length === 0) return undefined;
  const normalizedModelKeys = modelKeys.map(normalizeKey).filter(Boolean);
  const exact = snapshots.find((snapshot) => {
    const keys = [snapshot.id, snapshot.name].map(normalizeKey).filter(Boolean);
    return keys.some((key) => normalizedModelKeys.includes(key));
  });
  const primary = snapshots.find((snapshot) =>
    [snapshot.id, snapshot.name].map(normalizeKey).includes("codex"),
  );
  return exact ?? primary ?? account.snapshots[0];
}

function normalizeKey(value: string | undefined): string | undefined {
  return value?.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || undefined;
}

// ── account scoring ───────────────────────────────────────────

export interface ScoredAccount {
  email: string;
  fiveHourRemaining: number; // effective (× plan multiplier)
  sevenDayRemaining: number; // effective (× plan multiplier)
  lastUsed: number;
}

/**
 * Sort accounts for selection: highest effective 5H remaining → 7D → LRU.
 */
export function rankAccounts(list: ScoredAccount[]): ScoredAccount[] {
  return [...list].sort((a, b) => {
    if (b.fiveHourRemaining !== a.fiveHourRemaining) {
      return b.fiveHourRemaining - a.fiveHourRemaining;
    }
    if (b.sevenDayRemaining !== a.sevenDayRemaining) {
      return b.sevenDayRemaining - a.sevenDayRemaining;
    }
    return a.lastUsed - b.lastUsed;
  });
}

// ── abort signal merge ────────────────────────────────────────

export function mergeAbortSignals(signals: AbortSignal[]): AbortSignal {
  const controller = new AbortController();
  for (const sig of signals) {
    if (sig.aborted) {
      controller.abort(sig.reason);
      return controller.signal;
    }
    sig.addEventListener("abort", () => controller.abort(sig.reason), {
      once: true,
    });
  }
  return controller.signal;
}
