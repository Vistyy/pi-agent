import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { createNativePreviewRenderer } from "./native-renderer.js";
import { projectToolResults } from "./project.js";
import { ToolLensComponent } from "./ui.js";

const OVERLAY_WIDTH = "96%" as const;
const OVERLAY_HEIGHT_PERCENT = 94;
const OVERLAY_HEIGHT: `${number}%` = `${OVERLAY_HEIGHT_PERCENT}%`;
const OVERLAY_MARGIN = 1;

function overlayRows(terminalRows: number): number {
  const availableRows = Math.max(1, terminalRows - OVERLAY_MARGIN * 2);
  return Math.max(1, Math.min(Math.floor(terminalRows * OVERLAY_HEIGHT_PERCENT / 100), availableRows));
}

export async function openToolLens(ctx: ExtensionCommandContext): Promise<void> {
  if (ctx.mode !== "tui") {
    ctx.ui.notify("Tool Lens requires interactive mode.", "info");
    return;
  }

  const results = projectToolResults(ctx.sessionManager.getBranch());
  await ctx.ui.custom<void>((tui, theme, _keybindings, done) => {
    return new ToolLensComponent(
      results,
      theme,
      done,
      () => tui.requestRender(),
      createNativePreviewRenderer(ctx.cwd, theme),
      () => overlayRows(tui.terminal.rows),
    );
  }, {
    overlay: true,
    overlayOptions: {
      anchor: "center",
      width: OVERLAY_WIDTH,
      maxHeight: OVERLAY_HEIGHT,
      margin: OVERLAY_MARGIN,
    },
  });
}

export default function toolLensExtension(pi: ExtensionAPI): void {
  pi.registerCommand("lens", {
    description: "Inspect completed tool results from the active session branch",
    handler: async (_args, ctx) => openToolLens(ctx),
  });
}
