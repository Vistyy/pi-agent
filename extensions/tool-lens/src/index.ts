import { fileURLToPath } from "node:url";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { extensionCommandRunner, launchHerdrPopup } from "./herdr.js";
import { serializeTheme } from "./popup-protocol.js";
import { projectToolResults } from "./project.js";

const PLUGIN_ROOT = fileURLToPath(new URL("../", import.meta.url));

export async function openToolLens(ctx: ExtensionCommandContext, pi: ExtensionAPI): Promise<void> {
  if (ctx.mode !== "tui" || !ctx.hasUI) {
    ctx.ui.notify("Tool Lens requires interactive mode.", "info");
    return;
  }
  if (process.env.HERDR_ENV !== "1" || !process.env.HERDR_SOCKET_PATH) {
    ctx.ui.notify("Tool Lens requires Pi to run inside Herdr 0.7.4 or newer.", "error");
    return;
  }

  const snapshot = {
    cwd: ctx.cwd,
    results: projectToolResults(ctx.sessionManager.getBranch()),
    theme: serializeTheme(ctx.ui.theme),
  };
  try {
    await launchHerdrPopup(extensionCommandRunner(pi), PLUGIN_ROOT, snapshot);
  } catch (error) {
    ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
  }
}

export default function toolLensExtension(pi: ExtensionAPI): void {
  pi.registerCommand("lens", {
    description: "Inspect completed tool results from the active session branch",
    handler: async (_args, ctx) => openToolLens(ctx, pi),
  });
}
