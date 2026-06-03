import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

type Mode = "off" | "on" | "strong";
const MODES: Mode[] = ["off", "on", "strong"];

const PROMPT = `VISUAL AID MODE.
When explaining plans, flow, architecture, bugs, or tradeoffs, prefer compact visual structure.

Use simple ASCII/markdown visuals when useful:
- Cause/effect: A -> B -> C
- Nested flow:
  A
    -> B
      -> C
- Before/after blocks
- Tiny trees for files/components
- Tables only when they reduce text
- Bullets with arrows over paragraphs

Rules:
- Visuals clarify, not decorate.
- Keep diagrams small: usually 3-8 lines.
- Do not force diagram for trivial answers.
- Keep code blocks exact; diagrams outside code unless user asks otherwise.`;

const STRONG = `Strong visual bias:
- For any multi-step plan, start with one tiny map.
- For debugging, show symptom -> likely cause -> check -> fix.
- For implementation, show files -> changes -> test path.
- Prefer arrows and indentation over prose.`;

export default function visualAid(pi: ExtensionAPI) {
  let mode: Mode = "on";

  function label() {
    return mode === "off" ? "" : `visual:${mode}`;
  }

  pi.on("session_start", async (_event, ctx) => {
    for (const entry of ctx.sessionManager.getEntries()) {
      if (entry.type === "custom" && entry.customType === "visual-aid-mode") {
        const saved = (entry.data as { mode?: Mode })?.mode;
        if (saved && MODES.includes(saved)) mode = saved;
      }
    }
    ctx.ui.setStatus("visual-aid", label());
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
      ctx.ui.setStatus("visual-aid", label());
      ctx.ui.notify(mode === "off" ? "Visual aid off." : `Visual aid ${mode}.`, "info");
    },
  });

  pi.on("before_agent_start", async (event) => {
    if (mode === "off") return;
    const extra = mode === "strong" ? `\n\n${STRONG}` : "";
    return { systemPrompt: `${event.systemPrompt}\n\n${PROMPT}${extra}` };
  });
}
