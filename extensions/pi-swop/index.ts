// ── pi-swop ────────────────────────────────────────────────────
// Multi-account ChatGPT Codex balancer.
// Rotates per-request. Sums usage across accounts.
// Status displayed via statusline.ts "codex-usage" key.

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getApiProvider } from "@earendil-works/pi-ai";
import { loadStorage, importPiAuth } from "./state";
import { refreshAllUsage, updateStatus, clearStatus } from "./usage";
import { createRotatingStream, setOriginalCodexStream } from "./rotation";
import { registerCommand } from "./commands";
import { PROVIDER } from "./types";

export default function (pi: ExtensionAPI) {
  // ── capture original Codex stream before overriding ─────────
  const baseProvider = getApiProvider("openai-codex-responses");
  if (baseProvider?.streamSimple) {
    setOriginalCodexStream(baseProvider.streamSimple);
  } else {
    throw new Error(
      "swop: openai-codex-responses provider not found. Is pi up to date?",
    );
  }

  // ── lifecycle ──────────────────────────────────────────────

  pi.on("session_start", async (_event, ctx) => {
    await loadStorage();
    await importPiAuth();
    if (ctx.model?.provider !== PROVIDER) {
      clearStatus(ctx);
      return;
    }
    // Show immediately. Refresh usage in background so startup/reload does not
    // block on chatgpt.com.
    updateStatus(ctx);
    void refreshAllUsage().then(() => updateStatus(ctx));
  });

  pi.on("session_shutdown", (_event, ctx) => {
    clearStatus(ctx);
  });

  pi.on("model_select", (event, ctx) => {
    if (event.model.provider !== PROVIDER) {
      clearStatus(ctx);
      return;
    }
    updateStatus(ctx);
  });

  // ── command ────────────────────────────────────────────────

  registerCommand(pi);

  // ── provider ───────────────────────────────────────────────
  // Override openai-codex streaming with rotation wrapper.
  // pi preserves built-in models and baseUrl.

  pi.registerProvider("openai-codex", {
    api: "openai-codex-responses",
    streamSimple: createRotatingStream as any,
  });
}
