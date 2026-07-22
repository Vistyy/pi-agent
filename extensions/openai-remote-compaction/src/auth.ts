const AUTH_CLAIM = "https://api.openai.com/auth";

export interface CodexAuth {
  token: string;
  accountId: string;
  headers?: Record<string, string | null>;
}

export function extractAccountId(token: string): string {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) throw new Error("invalid token");
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as Record<
      string,
      unknown
    >;
    const auth = payload[AUTH_CLAIM] as Record<string, unknown> | undefined;
    if (typeof auth?.chatgpt_account_id !== "string") throw new Error("missing account ID");
    return auth.chatgpt_account_id;
  } catch {
    throw new Error("Failed to extract the ChatGPT account ID from Codex OAuth");
  }
}

export function buildCodexHeaders(auth: CodexAuth): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(auth.headers ?? {})) {
    if (value !== null) headers[key] = value;
  }
  headers.Authorization = `Bearer ${auth.token}`;
  headers["chatgpt-account-id"] = auth.accountId;
  headers.originator = "pi";
  return headers;
}
