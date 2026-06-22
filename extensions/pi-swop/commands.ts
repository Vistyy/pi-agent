// ── pi-swop: commands ──────────────────────────────────────────
// /swop list | login | rm

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
  getAllAccounts,
  getAccount,
  isPiAuth,
  saveStorage,
  storage,
  startDeviceLogin,
  pollDeviceToken,
} from "./state";
import { decodeEmail, formatResetTime, remaining } from "./logic";
import {
  refreshAllUsage,
  clearUsageCache,
  usageCache,
  updateStatus,
  getCombinedDisplay,
  clearStatus,
} from "./usage";
import { STATUS_KEY } from "./types";

const LOGIN_TIMEOUT_MS = 10 * 60 * 1000;
const LOGIN_MAX_POLL_INTERVAL_MS = 15_000;

export function registerCommand(pi: ExtensionAPI) {
  pi.registerCommand("codex-usage", {
    description: "Refresh Codex ChatGPT subscription usage status",
    handler: async (args, ctx) => {
      if (args.trim() === "--clear") {
        clearUsageCache();
        clearStatus(ctx);
        ctx.ui.notify("Codex usage status cleared", "info");
        return;
      }
      await refreshAllUsage();
      updateStatus(ctx);
      ctx.ui.notify(getUsageDetails(), "info");
    },
  });

  pi.registerCommand("swop", {
    description: "Manage ChatGPT subscription rotation",
    getArgumentCompletions(prefix) {
      const subs = ["list", "login", "rm"];
      return subs
        .filter((s) => s.startsWith(prefix))
        .map((s) => ({ value: s, label: s }));
    },
    handler: async (args, ctx) => {
      const [sub, ...rest] = args.trim().split(/\s+/);
      const restStr = rest.join(" ");

      switch (sub) {
        case "list":
        case "":
          await cmdList(ctx);
          break;
        case "login":
          await cmdLogin(ctx);
          break;
        case "add":
          ctx.ui.notify(
            "swop: API keys are not supported for Codex rotation. Use /swop login.",
            "warning",
          );
          break;
        case "rm":
          await cmdRemove(ctx, restStr);
          break;
        default:
          ctx.ui.notify(
            "swop: list | login | rm <email>",
            "info",
          );
      }
    },
  });
}

function getUsageDetails(): string {
  const summary = getCombinedDisplay() ?? "Codex usage unavailable";
  const accounts = usageCache?.accounts ?? [];
  if (accounts.length === 0) return summary;
  return [
    summary,
    ...accounts.map((a) => {
      const fh = a.fiveHour ? remaining(a.fiveHour) : "?";
      const sd = a.sevenDay ? remaining(a.sevenDay) : "?";
      return `${a.email}: 5H ${fh}% 7D ${sd}%`;
    }),
    "Source: https://chatgpt.com/backend-api/wham/usage",
  ].join("\n");
}

// ── list ──────────────────────────────────────────────────────

async function cmdList(ctx: ExtensionContext): Promise<void> {
  const accounts = getAllAccounts();
  if (accounts.length === 0) {
    ctx.ui.notify("No accounts. Use /swop login.", "info");
    return;
  }

  ctx.ui.setStatus(STATUS_KEY, ctx.ui.theme.fg("dim", "Codex fetching…"));
  await refreshAllUsage();
  updateStatus(ctx);

  const lines = accounts.map((a) => {
    const usage = usageCache?.accounts.find((u) => u.email === a.email);
    const fh = usage?.fiveHour;
    const sd = usage?.sevenDay;
    const fhPct = fh ? remaining(fh) : "?";
    const sdPct = sd ? remaining(sd) : "?";
    const fhReset = formatResetTime(fh?.resetAt);
    const sdReset = formatResetTime(sd?.resetAt);
    const cooldown = a.cooldownUntil > Date.now() ? " 🕐" : "";
    const source = isPiAuth(a) ? " (pi)" : "";
    const tier = usage?.planTier && usage.planTier !== "unknown"
      ? ` [${usage.planTier}]` : "";
    return [
      `${a.email}${cooldown}${source}${tier}`,
      `  5H ${fhPct}%  reset ${fhReset}`,
      `  7D ${sdPct}%  reset ${sdReset}`,
    ].join("\n");
  });
  lines.push("+ Add account (login)");

  while (true) {
    const choice = await ctx.ui.select(
      "Codex accounts (enter for actions, esc to close)",
      lines,
    );
    if (choice === undefined) return;

    if (choice.startsWith("+ Add")) {
      const addMethod = await ctx.ui.select("Add account", [
        "Login with ChatGPT (OAuth)",
        "Back",
      ]);
      if (addMethod === "Login with ChatGPT (OAuth)") {
        await cmdLogin(ctx);
        return;
      }
      continue;
    }

    const idx = lines.indexOf(choice);
    if (idx < 0) continue;
    const account = accounts[idx];

    const action = await ctx.ui.select(account.email, [
      `Remove ${account.email}`,
      "Back",
    ]);
    if (action === undefined || action === "Back") continue;

    if (action.startsWith("Remove ")) {
      if (isPiAuth(account)) {
        ctx.ui.notify(
          "Cannot remove pi-imported account. Use /login openai-codex.",
          "warning",
        );
        continue;
      }
      const ok = await ctx.ui.confirm(
        "Remove account?",
        `Remove ${account.email}?`,
      );
      if (ok) {
        storage.accounts = storage.accounts.filter(
          (a) => a.email !== account.email,
        );
        await saveStorage();
        clearUsageCache();
        updateStatus(ctx);
        ctx.ui.notify(`Removed ${account.email}`, "info");
        return;
      }
    }
  }
}

// ── login ─────────────────────────────────────────────────────

async function cmdLogin(ctx: ExtensionContext): Promise<void> {
  ctx.ui.setStatus(STATUS_KEY, ctx.ui.theme.fg("dim", "Codex logging in…"));

  try {
    const device = await startDeviceLogin();
    ctx.ui.notify(
      `Codex login\nCode: ${device.userCode}\nVisit: ${device.verificationUri}\nWaiting for authorization...`,
      "info",
    );

    let creds = null;
    let intervalMs = Math.min(
      Math.max(device.intervalSeconds, 1) * 1000,
      LOGIN_MAX_POLL_INTERVAL_MS,
    );
    const deadline = Date.now() + LOGIN_TIMEOUT_MS;
    while (!creds) {
      if (Date.now() > deadline) throw new Error("login timed out");
      await sleep(intervalMs, ctx.signal);
      creds = await pollDeviceToken(device.deviceAuthId, device.userCode);
      intervalMs = Math.min(intervalMs + 1000, LOGIN_MAX_POLL_INTERVAL_MS);
    }

    const email = decodeEmail(creds.access) ?? `codex-${Date.now()}`;

    const existing = storage.accounts.find((a) => a.email === email);
    if (existing) {
      existing.accessToken = creds.access;
      existing.refreshToken = creds.refresh;
      existing.expiresAt = creds.expires;
    } else {
      storage.accounts.push({
        email,
        accessToken: creds.access,
        refreshToken: creds.refresh,
        expiresAt: creds.expires,
        cooldownUntil: 0,
        lastUsed: 0,
      });
    }

    await saveStorage();
    clearUsageCache();
    await refreshAllUsage();
    updateStatus(ctx);
    ctx.ui.notify(`Codex: logged in as ${email}`, "info");
  } catch (err) {
    ctx.ui.notify(
      `Codex login failed: ${err instanceof Error ? err.message : String(err)}`,
      "error",
    );
    updateStatus(ctx);
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error("cancelled"));
      return;
    }
    const timeout = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timeout);
        reject(new Error("cancelled"));
      },
      { once: true },
    );
  });
}

// ── rm ────────────────────────────────────────────────────────

async function cmdRemove(ctx: ExtensionContext, email: string): Promise<void> {
  if (!email) {
    ctx.ui.notify("Usage: /swop rm <email>", "warning");
    return;
  }
  const acc = getAccount(email);
  if (!acc) {
    ctx.ui.notify(`Account ${email} not found.`, "warning");
    return;
  }
  if (isPiAuth(acc)) {
    ctx.ui.notify("Cannot remove pi-imported account.", "warning");
    return;
  }
  storage.accounts = storage.accounts.filter((a) => a.email !== email);
  await saveStorage();
  clearUsageCache();
  updateStatus(ctx);
  ctx.ui.notify(`Removed ${email}`, "info");
}
