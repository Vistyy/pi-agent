import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createSettingsManager, createToolCardDefinitions, findToolConflicts } from "./tools.js";

export default function toolCardsExtension(pi: ExtensionAPI): void {
  pi.on("session_start", async (_event, ctx) => {
    const conflicts = findToolConflicts(pi);
    if (conflicts.length > 0) {
      throw new Error(`[tool-cards] startup conflict: another extension already owns ${conflicts.join(", ")}`);
    }
    const settings = createSettingsManager(ctx);
    const definitions = createToolCardDefinitions(ctx.cwd, settings);
    for (const definition of Object.values(definitions)) {
      pi.registerTool(definition);
    }
  });
}

export { createToolCardDefinitions, findToolConflicts } from "./tools.js";
export { ToolCardComponent, renderToolCard } from "./renderer.js";
export * from "./summaries.js";
export * from "./types.js";
