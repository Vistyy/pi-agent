// ── pi-swop ────────────────────────────────────────────────────
// Multi-account ChatGPT Codex balancer.
// Rotates per-request. Sums usage across accounts.
// Status displayed via statusline.ts "codex-usage" key.

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { loadStorage, importPiAuth } from "./state";
import { updateStatus, clearStatus, refreshUsageInBackground } from "./usage";
import { registerCommand } from "./commands";
import { PROVIDER } from "./types";
import { registerSwopProvider, unregisterSwopProvider } from "./provider";

export default function (pi: ExtensionAPI) {
  registerSwopProvider(pi);

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
    refreshUsageInBackground(ctx);
  });

  pi.on("session_shutdown", (_event, ctx) => {
    clearStatus(ctx);
    unregisterSwopProvider(pi);
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

}
