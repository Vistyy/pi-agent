import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

function agentFile(name: string) {
  return join(homedir(), ".pi", "agent", name);
}

function readJson(path: string): any | undefined {
  try {
    if (!existsSync(path)) return undefined;
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return undefined;
  }
}

function getAuthEntry(provider: string): any | undefined {
  return readJson(agentFile("auth.json"))?.[provider];
}

export function getCodexAuth(): { access: string; accountId?: string; expires?: number } | undefined {
  const entry = getAuthEntry("openai-codex");
  if (entry?.type === "oauth" && typeof entry.access === "string") {
    return { access: entry.access, accountId: entry.accountId, expires: entry.expires };
  }
  return undefined;
}

export function getApiKey(provider: string): string | undefined {
  const envByProvider: Record<string, string[]> = {
    openai: ["OPENAI_API_KEY"],
    "openai-codex": ["OPENAI_API_KEY"],
    anthropic: ["ANTHROPIC_API_KEY"],
    google: ["GEMINI_API_KEY", "GOOGLE_API_KEY"],
    xai: ["XAI_API_KEY"],
    zai: ["ZAI_API_KEY"],
    exa: ["EXA_API_KEY"],
  };
  for (const env of envByProvider[provider] ?? []) {
    if (process.env[env]) return process.env[env];
  }
  const entry = getAuthEntry(provider);
  if (entry?.type === "api_key" && typeof entry.key === "string" && !entry.key.startsWith("!")) return entry.key;

  // Optional compatibility with pi-web-access-style config if the user already has it.
  const webConfig = readJson(join(homedir(), ".pi", "web-search.json"));
  if (provider === "exa" && typeof webConfig?.exaApiKey === "string") return webConfig.exaApiKey;
  return undefined;
}
