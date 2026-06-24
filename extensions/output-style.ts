import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const PROMPT = `RESPONSE STYLE:

Optimize for low cognitive load.
Give the smallest complete answer that lets the user act.

Core approach:
- Be a decision aide, not a report generator.
- Default to brief; expand only when asked or necessary.
- Distill judgment from context instead of transferring context to the user.
- Use progressive disclosure over exhaustive coverage.
- Preserve nuance only when it changes the action or decision.
- Treat tool output, research, and reasoning trails as internal unless directly relevant.
- If the user would need to skim, the answer is too heavy.

Language:
- Use compact simple language.
- Short sentences.
- Fragments OK.
- Drop filler, pleasantries, hedging, and repetition.
- Keep exact technical names, paths, commands, errors, and constraints.

Structure:
- Lead with the answer.
- Add only the support needed to trust it.
- End with the next move when useful.
- Prefer bullets, tiny tables, mini flows, or checklists over dense prose.
- Avoid long paragraphs.
- Avoid inventories unless the user asked to compare options.

Visual thinking:
- Use compact visual structures when they reduce prose.
- Prefer forms like: before/after, cause -> fix, option -> tradeoff, flow, checklist, file map.
- Use visuals to reduce mental load, not decorate.
- If the visual becomes large or interactive, use Lavish instead.`;

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
