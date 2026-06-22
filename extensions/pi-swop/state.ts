// ── pi-swop: state ─────────────────────────────────────────────
// Account storage, pi auth.json import, token refresh.

import { chmod, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Account, Storage } from "./types";
import { decodeEmail } from "./logic";

const STORAGE_PATH = join(process.env.HOME!, ".pi/agent/swop-accounts.json");
const AUTH_PATH = join(process.env.HOME!, ".pi/agent/auth.json");
const CODEX_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const AUTH_DOMAIN = "https://auth.openai.com";
const REFRESH_SKEW_MS = 60_000;

export let storage: Storage = { accounts: [] };
export let piAuthAccount: Account | null = null;

const refreshLocks = new Map<string, Promise<string>>();

export async function loadStorage(): Promise<void> {
  try {
    const raw = await readFile(STORAGE_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<Storage>;
    storage = normalizeStorage(parsed);
  } catch {
    storage = { accounts: [] };
  }
}

export async function saveStorage(): Promise<void> {
  await mkdir(dirname(STORAGE_PATH), { recursive: true, mode: 0o700 });
  const tmpPath = `${STORAGE_PATH}.${process.pid}.${Date.now()}.tmp`;
  try {
    await writeFile(tmpPath, JSON.stringify(storage, null, 2), { mode: 0o600 });
    await chmod(tmpPath, 0o600).catch(() => {});
    await rename(tmpPath, STORAGE_PATH);
  } catch (error) {
    await rm(tmpPath, { force: true }).catch(() => {});
    throw error;
  }
  await chmod(STORAGE_PATH, 0o600).catch(() => {});
}

function normalizeStorage(value: Partial<Storage>): Storage {
  const accounts = Array.isArray(value.accounts)
    ? value.accounts.map(normalizeAccount).filter((account): account is Account => Boolean(account))
    : [];
  const seen = new Set<string>();
  return {
    accounts: accounts.filter((account) => {
      if (seen.has(account.email)) return false;
      seen.add(account.email);
      return true;
    }),
  };
}

function normalizeAccount(value: unknown): Account | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const email = typeof raw.email === "string" ? raw.email : "";
  const accessToken = typeof raw.accessToken === "string" ? raw.accessToken : "";
  const refreshToken = typeof raw.refreshToken === "string" ? raw.refreshToken : null;
  const expiresAt = asFiniteNumber(raw.expiresAt) ?? 0;
  const cooldownUntil = asFiniteNumber(raw.cooldownUntil) ?? 0;
  const lastUsed = asFiniteNumber(raw.lastUsed) ?? 0;
  if (!email || !accessToken) return null;
  return { email, accessToken, refreshToken, expiresAt, cooldownUntil, lastUsed };
}

function asFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function getAllAccounts(): Account[] {
  const list = [...storage.accounts];
  if (piAuthAccount) list.push(piAuthAccount);
  return list;
}

export function getAccount(email: string): Account | undefined {
  if (piAuthAccount?.email === email) return piAuthAccount;
  return storage.accounts.find((account) => account.email === email);
}

export function isPiAuth(account: Account): boolean {
  return piAuthAccount !== null && account === piAuthAccount;
}

export async function importPiAuth(): Promise<void> {
  try {
    const raw = await readFile(AUTH_PATH, "utf8");
    const auth = JSON.parse(raw) as Record<string, unknown>;
    const entry = auth["openai-codex"] as Record<string, unknown> | undefined;
    if (!entry || entry.type !== "oauth") {
      piAuthAccount = null;
      return;
    }

    const access = typeof entry.access === "string" ? entry.access : "";
    const refresh = typeof entry.refresh === "string" ? entry.refresh : "";
    const expires = typeof entry.expires === "number" ? entry.expires : Date.now() + 3600_000;
    const accountId = typeof entry.accountId === "string" ? entry.accountId : undefined;

    if (!access || !refresh) {
      piAuthAccount = null;
      return;
    }

    const email = decodeEmail(access) ?? `codex-${accountId?.slice(0, 8) ?? "imported"}`;
    if (storage.accounts.some((account) => account.email === email)) {
      piAuthAccount = null;
      return;
    }

    piAuthAccount = {
      email,
      accessToken: access,
      refreshToken: refresh,
      expiresAt: expires,
      cooldownUntil: 0,
      lastUsed: 0,
    };
  } catch {
    piAuthAccount = null;
  }
}

const DEVICE_USER_CODE_URL = `${AUTH_DOMAIN}/api/accounts/deviceauth/usercode`;
const DEVICE_TOKEN_URL = `${AUTH_DOMAIN}/api/accounts/deviceauth/token`;
const TOKEN_URL = `${AUTH_DOMAIN}/oauth/token`;
const DEVICE_VERIFICATION_URI = `${AUTH_DOMAIN}/codex/device`;
const DEVICE_REDIRECT_URI = `${AUTH_DOMAIN}/deviceauth/callback`;

interface OAuthCreds {
  access: string;
  refresh: string;
  expires: number;
}

export async function refreshToken(refreshToken: string): Promise<OAuthCreds> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: CODEX_CLIENT_ID,
    }).toString(),
  });
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(
      (json.error_description as string) ?? (json.error as string) ?? `HTTP ${res.status}`,
    );
  }
  return {
    access: json.access_token as string,
    refresh: (json.refresh_token as string) ?? refreshToken,
    expires: Date.now() + ((json.expires_in as number) ?? 3600) * 1000,
  };
}

export async function startDeviceLogin(): Promise<{
  deviceAuthId: string;
  userCode: string;
  verificationUri: string;
  intervalSeconds: number;
}> {
  const res = await fetch(DEVICE_USER_CODE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: CODEX_CLIENT_ID }),
  });
  if (!res.ok) {
    let body = "";
    try {
      body = await res.text();
    } catch {}
    throw new Error(`Device code request failed (${res.status}): ${body || res.statusText}`);
  }
  const json = (await res.json()) as Record<string, unknown>;
  const intervalSeconds = typeof json.interval === "string"
    ? Number((json.interval as string).trim())
    : (json.interval as number);
  if (
    !json.device_auth_id ||
    !json.user_code ||
    typeof intervalSeconds !== "number" ||
    !Number.isFinite(intervalSeconds) ||
    intervalSeconds < 0
  ) {
    throw new Error(`Invalid device code response: ${JSON.stringify(json)}`);
  }
  return {
    deviceAuthId: json.device_auth_id as string,
    userCode: json.user_code as string,
    verificationUri: DEVICE_VERIFICATION_URI,
    intervalSeconds,
  };
}

export async function pollDeviceToken(
  deviceAuthId: string,
  userCode: string,
): Promise<OAuthCreds | null> {
  const res = await fetch(DEVICE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ device_auth_id: deviceAuthId, user_code: userCode }),
  });

  if (res.ok) {
    const json = (await res.json()) as Record<string, unknown>;
    const authCode = json.authorization_code as string | undefined;
    const codeVerifier = json.code_verifier as string | undefined;
    if (!authCode || !codeVerifier) {
      throw new Error(`Invalid device token response: ${JSON.stringify(json)}`);
    }
    return await exchangeCode(authCode, codeVerifier);
  }

  if (res.status === 403 || res.status === 404) return null;

  let body = "";
  try {
    body = await res.text();
  } catch {}

  let errorCode: string | undefined;
  try {
    const json = JSON.parse(body) as Record<string, unknown>;
    const err = json.error as string | Record<string, unknown> | undefined;
    errorCode = typeof err === "object" && err !== null
      ? (err as Record<string, unknown>).code as string | undefined
      : err;
  } catch {}

  if (errorCode === "deviceauth_authorization_pending") return null;
  if (errorCode === "slow_down") return null;

  throw new Error(`Device auth failed (${res.status}): ${body}`);
}

async function exchangeCode(
  authorizationCode: string,
  codeVerifier: string,
): Promise<OAuthCreds> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: CODEX_CLIENT_ID,
      code: authorizationCode,
      code_verifier: codeVerifier,
      redirect_uri: DEVICE_REDIRECT_URI,
    }).toString(),
  });

  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(`Token exchange failed (${res.status}): ${JSON.stringify(json)}`);
  }
  if (!json.access_token || !json.refresh_token) {
    throw new Error(`Token exchange missing fields: ${JSON.stringify(json)}`);
  }
  return {
    access: json.access_token as string,
    refresh: json.refresh_token as string,
    expires: Date.now() + ((json.expires_in as number) ?? 3600) * 1000,
  };
}

export async function ensureToken(account: Account): Promise<string> {
  if (account.expiresAt > Date.now() + REFRESH_SKEW_MS) return account.accessToken;

  const existing = refreshLocks.get(account.email);
  if (existing) return existing;

  const refreshPromise = refreshAccountToken(account).finally(() => {
    refreshLocks.delete(account.email);
  });
  refreshLocks.set(account.email, refreshPromise);
  return refreshPromise;
}

async function refreshAccountToken(account: Account): Promise<string> {
  if (isPiAuth(account)) {
    await importPiAuth();
    const target = piAuthAccount ?? account;
    if (target.expiresAt > Date.now() + REFRESH_SKEW_MS) {
      return target.accessToken;
    }
    if (target.refreshToken) {
      const fresh = await refreshToken(target.refreshToken);
      target.accessToken = fresh.access;
      target.refreshToken = fresh.refresh;
      target.expiresAt = fresh.expires;
      piAuthAccount = target;
      return target.accessToken;
    }
    throw new Error(`pi auth token for ${target.email} is expired`);
  }

  if (!account.refreshToken) {
    throw new Error(`account ${account.email} has no refresh token`);
  }

  const fresh = await refreshToken(account.refreshToken);
  account.accessToken = fresh.access;
  account.refreshToken = fresh.refresh;
  account.expiresAt = fresh.expires;
  await saveStorage();
  return account.accessToken;
}
