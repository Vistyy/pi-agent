// ── pi-swop shared types ───────────────────────────────────────

export type PlanTier = "free" | "plus" | "pro-lite" | "pro" | "unknown";

export interface Account {
  email: string;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number;
  cooldownUntil: number;
  lastUsed: number;
}

export interface UsageWindow {
  usedPercent: number;
  resetAt: number | undefined;
}

export interface UsageSnapshot {
  id: string;
  name?: string;
  fiveHour: UsageWindow | null;
  sevenDay: UsageWindow | null;
}

export interface AccountUsage {
  email: string;
  planTier: PlanTier;
  fiveHour: UsageWindow | null;
  sevenDay: UsageWindow | null;
  snapshots?: UsageSnapshot[];
}

export interface Storage {
  accounts: Account[];
}

export const PROVIDER = "openai-codex";
export const STATUS_KEY = "codex-usage";
export const COOLDOWN_MS = 60_000;
export const MAX_RETRIES = 5;

/** Multiplier to normalize usage across plan tiers (plus = baseline 1×). */
export const PLAN_MULTIPLIERS: Record<PlanTier, number> = {
  free: 1,
  plus: 1,
  "pro-lite": 5,
  pro: 20,
  unknown: 1,
};
