import type { Account } from "./types";
import { COOLDOWN_MS, PLAN_MULTIPLIERS } from "./types";
import { clamp, rankAccounts } from "./logic";
import { getAccount, getAllAccounts, isPiAuth, saveStorage } from "./state";
import { usageCache } from "./usage";

export function pickAccount(exclude: Set<string>): Account | null {
  const now = Date.now();
  const accounts = getAllAccounts().filter(
    (account) => !exclude.has(account.email) && account.cooldownUntil < now,
  );
  if (accounts.length === 0) return null;

  const scored = accounts.map((account) => {
    const usage = usageCache?.accounts.find((item) => item.email === account.email);
    const mult = PLAN_MULTIPLIERS[usage?.planTier ?? "unknown"];
    return {
      email: account.email,
      fiveHourRemaining: usage?.fiveHour
        ? (100 - clamp(usage.fiveHour.usedPercent)) * mult
        : 100 * mult,
      sevenDayRemaining: usage?.sevenDay
        ? (100 - clamp(usage.sevenDay.usedPercent)) * mult
        : 100 * mult,
      lastUsed: account.lastUsed,
    };
  });

  const ranked = rankAccounts(scored);
  return getAccount(ranked[0].email) ?? null;
}

export function markAccountUsed(account: Account): void {
  account.lastUsed = Date.now();
  persistMutableAccount(account);
}

export function markAccountCooldown(account: Account, cooldownMs = COOLDOWN_MS): void {
  account.cooldownUntil = Date.now() + cooldownMs;
  persistMutableAccount(account);
}

export function persistMutableAccount(account: Account): void {
  if (!isPiAuth(account)) {
    void saveStorage().catch(() => {});
  }
}

export function isQuotaErrorMessage(message: string): boolean {
  return /rate.?limit|quota|too many requests|429|usage limit|limit reached/i.test(message);
}

export function isAuthErrorMessage(message: string): boolean {
  return /unauthorized|forbidden|invalid.?token|expired.?token|401|403/i.test(message);
}

export function messageFromThrown(value: unknown): string {
  if (value instanceof Error) return value.message;
  return String(value);
}
