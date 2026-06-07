import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

type Level = "off" | "lite" | "full" | "ultra";

const LEVELS: Level[] = ["off", "lite", "full", "ultra"];
const STOP = new Set(["off", "stop", "quit", "normal"]);

const BASE = `IMPORTANT: NO FLUFF MODE.
Minimal prose. Visualize concepts.

Rules:
- No pleasantries, hedging, filler, background, alternatives.
- Prose only for: safety warnings, exact commands/paths, error text, one-line summary.
- For anything with structure (flow, hierarchy, comparison, before/after, cause/effect, multi-step):
  → prefer ASCII diagram. Prose is just a short caption.
- Default shape for text: issue → cause → fix → next step. 1-2 lines.
- When in doubt, draw. Ask for clarification if needed.
- Never omit safety-critical caveats or irreversible-action warnings.

Progressive disclosure:
- Start with visual summary. Offer to expand: "Detail on any part?"
- User asks for detail → still prefer diagram over paragraph.
- User asks for text explanation → then use prose.`;

const INTENSITY: Record<Exclude<Level, "off">, string> = {
  lite: `Terse prose ok. Use visuals for multi-step/multi-part info.`,
  full: `Fragments. Drop articles. Default to visual for >2 elements. Max 3 prose lines.`,
  ultra: `No prose. Pure visuals. Arrows, trees, tables. Labels + code blocks only.`,
};

export default function noFluff(pi: ExtensionAPI) {
  let level: Level = "full";

  pi.on("session_start", async (_event, ctx) => {
    for (const entry of ctx.sessionManager.getEntries()) {
      if (entry.type === "custom" && entry.customType === "nofluff-level") {
        const saved = (entry.data as { level?: Level })?.level;
        if (saved && LEVELS.includes(saved)) level = saved;
      }
    }
    ctx.ui.setStatus("nofluff", undefined);
  });

  pi.registerCommand("nofluff", {
    description: "Toggle no-fluff response mode: /nofluff [lite|full|ultra|off]",
    getArgumentCompletions: (prefix) => {
      const p = prefix.trim().toLowerCase();
      const opts = ["lite", "full", "ultra", "off", "stop", "normal"];
      return opts.filter((v) => v.startsWith(p)).map((v) => ({ value: v, label: v })) || null;
    },
    handler: async (args, ctx) => {
      const arg = args.trim().toLowerCase();
      if (!arg) level = level === "off" ? "full" : "off";
      else if (STOP.has(arg)) level = "off";
      else if (LEVELS.includes(arg as Level)) level = arg as Level;
      else {
        ctx.ui.notify(`Unknown nofluff level: ${arg}`, "error");
        return;
      }

      pi.appendEntry("nofluff-level", { level });
      ctx.ui.setStatus("nofluff", undefined);
      ctx.ui.notify(level === "off" ? "No fluff off." : `No fluff ${level}.`, "info");
    },
  });

  pi.on("before_agent_start", async (event) => {
    if (level === "off") return;
    return { systemPrompt: `${event.systemPrompt}\n\n${BASE}\n\n${INTENSITY[level]}` };
  });
}
