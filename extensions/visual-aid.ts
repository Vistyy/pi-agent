import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

type Mode = "off" | "on" | "strong";
const MODES: Mode[] = ["off", "on", "strong"];

const PROMPT = `VISUAL AID MODE.
Default response: Unicode box-drawing diagrams. Prose is caption, not body.

Box glyphs: ┌ ┐ └ ┘ ├ ┤ ┬ ┴ ┼ │ ─ ═ ║ ╔ ╗ ╚ ╝ ╠ ╣ ╦ ╩ ╬
Arrows: → ← ↑ ↓ ↔ ⇒ ⇐

Style (one example):
   ┌──────┐  yes  ┌──────┐
   │ check│──────→│ fix  │
   └──┬───┘       └──────┘
      │ no
      ↓
   ┌──────┐
   │ skip │
   └──────┘

Patterns: flow, tree, table, state machine, dependency graph, before/after, file map.

Rules:
- Diagrams carry the payload. 1-line prose caption max.
- 3-12 lines per diagram. Trivial answers don't need one.
- Code blocks stay exact, outside diagrams.
`;

const STRONG = `Strong visual mode:
- Every non-trivial reply must contain a Unicode box-drawing diagram.
- No prose paragraphs. 1-line label max.
- Double-line ╔╗╚╝╠╣╦╩╬ for emphasis. ⚠/✓ for pass/fail markers.
- Debug: ┌symptom┐ → ┌cause┐ → ┌fix┐ → ┌verify┐
- Impl: file tree + edit arrows + test path.
- Arrows, boxes, indentation. No sentences.`;

export default function visualAid(pi: ExtensionAPI) {
  let mode: Mode = "on";

  pi.on("session_start", async (_event, ctx) => {
    for (const entry of ctx.sessionManager.getEntries()) {
      if (entry.type === "custom" && entry.customType === "visual-aid-mode") {
        const saved = (entry.data as { mode?: Mode })?.mode;
        if (saved && MODES.includes(saved)) mode = saved;
      }
    }
    ctx.ui.setStatus("visual-aid", undefined);
  });

  pi.registerCommand("visual", {
    description: "Toggle visual-aid response style: /visual [on|strong|off]",
    getArgumentCompletions: (prefix) => {
      const p = prefix.trim().toLowerCase();
      return ["on", "strong", "off", "stop"].filter((v) => v.startsWith(p)).map((v) => ({ value: v, label: v })) || null;
    },
    handler: async (args, ctx) => {
      const arg = args.trim().toLowerCase();
      if (!arg) mode = mode === "off" ? "on" : "off";
      else if (arg === "stop" || arg === "off") mode = "off";
      else if (MODES.includes(arg as Mode)) mode = arg as Mode;
      else {
        ctx.ui.notify(`Unknown visual mode: ${arg}`, "error");
        return;
      }

      pi.appendEntry("visual-aid-mode", { mode });
      ctx.ui.setStatus("visual-aid", undefined);
      ctx.ui.notify(mode === "off" ? "Visual aid off." : `Visual aid ${mode}.`, "info");
    },
  });

  pi.on("before_agent_start", async (event) => {
    if (mode === "off") return;
    const extra = mode === "strong" ? `\n\n${STRONG}` : "";
    return { systemPrompt: `${event.systemPrompt}\n\n${PROMPT}${extra}` };
  });
}
