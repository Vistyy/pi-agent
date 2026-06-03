    import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

type Level = "off" | "lite" | "full" | "ultra";

const LEVELS: Level[] = ["off", "lite", "full", "ultra"];
const STOP = new Set(["off", "stop", "quit", "normal"]);

const BASE = `IMPORTANT: NO FLUFF MODE.
Cut filler. Keep technical substance.

Rules:
- No pleasantries, hedging, filler.
- Prefer short sentences / fragments.
- Keep exact technical terms, paths, commands, error text.
- Code unchanged.
- Default shape: issue → cause → fix → next step.
- If user asks for detail, give detail, still tight.
- For safety/irreversible actions: be explicit, not cryptic.

Progressive disclosure:
- Default to minimal useful answer.
- Include only: answer, key caveat, next step.
- Omit exhaustive options, full implementation, long tables unless asked.
- If topic has depth, end with compact "Can expand: A/B/C" menu.
- Never omit safety-critical caveats or irreversible-action warnings.`;

const INTENSITY: Record<Exclude<Level, "off">, string> = {
  lite: `Professional, terse. Full grammar ok. No fluff.`,
  full: `Fragments ok. Drop articles where clear. Use short synonyms.`,
  ultra: `Maximum compression. Abbrev common terms. Use arrows for cause/effect.`,
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
