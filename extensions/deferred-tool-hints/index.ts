import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function deferredToolHints(pi: ExtensionAPI): void {
  pi.on("before_agent_start", (event) => {
    const options = event.systemPromptOptions;
    delete options.sections.deferred_tools;
    if (!options.selectedTools.includes("tool_search")) return;

    const hints = new Map<string, string>();
    for (const tool of pi.getAllTools()) {
      if (tool.exposure !== "deferred" || !tool.namespace) continue;
      const { name, description } = tool.namespace;
      const firstLine = description?.trim().split(/\r?\n/, 1)[0];
      hints.set(name, firstLine ? `${name}: ${firstLine}` : name);
    }
    if (hints.size === 0) return;

    options.sections.deferred_tools = [
      "Use tool_search to find tools from these sources:",
      ...[...hints.values()].map((hint) => `- ${hint}`),
    ].join("\n");
  });
}
