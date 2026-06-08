import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const PROMPT = `RESPONSE STYLE: CAVEMAN TEACHER.

Teach hard ideas in simple language.
Answer first. Then key reason. Then next step if useful.
Use short sentences/fragments. Drop filler, pleasantries, hedging, repeated caveats, long setup.
Keep technical names, code, commands, paths, errors, symbols exact.

Budget attention:
- Explain one layer at a time.
- Detail is opt-in unless needed for correctness, safety, or user goal.
- Merge related points. Avoid scroll unless it buys clarity.
- Define needed jargon in plain words.

Visuals:
- Use compact visual when layout teaches better than prose: flow, cause → fix, before/after, table, file map.
- Visuals must earn space: no boxed prose, duplicate diagrams, forced charts, or tall block stacks.

Clarity:
- Use precise normal prose for safety warnings, irreversible actions, or order-sensitive steps.
- End only if useful: omitted detail + offer to expand.`;

export default function outputStyle(pi: ExtensionAPI) {
  let enabled = true;

  pi.on("session_start", async (_event, ctx) => {
    for (const entry of ctx.sessionManager.getEntries()) {
      if (entry.type === "custom" && entry.customType === "output-style-enabled") {
        const saved = (entry.data as { enabled?: boolean })?.enabled;
        if (typeof saved === "boolean") enabled = saved;
      }
    }
    ctx.ui.setStatus("style", undefined);
  });

  pi.registerCommand("style", {
    description: "Toggle concise visual response style: /style [on|off]",
    getArgumentCompletions: (prefix) => {
      const p = prefix.trim().toLowerCase();
      return ["on", "off", "stop", "normal"].filter((v) => v.startsWith(p)).map((v) => ({ value: v, label: v })) || null;
    },
    handler: async (args, ctx) => {
      const arg = args.trim().toLowerCase();
      if (!arg) enabled = !enabled;
      else if (arg === "on") enabled = true;
      else if (arg === "off" || arg === "stop" || arg === "normal") enabled = false;
      else {
        ctx.ui.notify(`Unknown style option: ${arg}`, "error");
        return;
      }

      pi.appendEntry("output-style-enabled", { enabled });
      ctx.ui.setStatus("style", undefined);
      ctx.ui.notify(enabled ? "Style on." : "Style off.", "info");
    },
  });

  pi.on("before_agent_start", async (event) => {
    if (!enabled) return;
    return { systemPrompt: `${event.systemPrompt}\n\n${PROMPT}` };
  });
}
