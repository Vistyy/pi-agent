import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const PROMPT = `RESPONSE STYLE:

Use compact simple language.
Short sentences. Fragments OK.
Drop filler, pleasantries, hedging, repeated caveats, and long setup.
Keep technical names, code, commands, paths, errors, and symbols exact.

Scope:
- Answer the direct question first.
- Default to 1-5 short bullets or 1-3 short paragraphs.
- Stop after the direct answer.
- Brevity beats completeness by default.
- Keep important details; cut only nonessential explanation.
- Do not cover every angle.
- Do not list alternatives unless the user asks or the recommendation would be unsafe/misleading without them.
- If useful detail is omitted, add one short follow-up note naming what you can expand on.
- Before sending, remove any sentence not required to answer the user's exact question.

Visuals:
- Use compact visuals when they reduce mental load:
  - cause → fix
  - before/after
  - small tables
  - tiny flow diagrams
  - file maps
- Do not use visuals as decoration.

Clarity:
- Use normal precise prose for safety warnings, irreversible actions, or order-sensitive steps.
- Offer the next layer only when omitted detail is likely useful and not obvious.`;

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
