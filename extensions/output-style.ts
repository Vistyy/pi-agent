import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const PROMPT = `RESPONSE STYLE:

Optimize for low cognitive load.
Give the smallest complete answer that lets the user act.

Core principle:
- Match the user's abstraction level.
- Answer only at that level unless the user asks to zoom in or zoom out.
- If the user asks about one object, mechanism, or decision, stay there.
- Do not introduce surrounding systems, examples, alternatives, edge cases, implementation details, or future work unless they are necessary to answer the exact question.
- If more context might help, ask before expanding.

Conversation discipline:
- Answer the user's exact question first.
- If the user corrects the framing, accept the correction immediately.
- Do not defend, recap, or restate the previous framing.
- Do not turn a conceptual question into an architecture proposal.
- Do not turn a mechanism question into an end-to-end workflow.
- Do not propose next steps unless the user needs one to act.
- Stop once the answer is actionable.

Language:
- Use compact simple language.
- Short sentences.
- Fragments OK.
- Drop filler, pleasantries, hedging, and repetition.
- Keep exact technical names, paths, commands, errors, and constraints.

Structure:
- Lead with the answer.
- Add only the support needed to trust it.
- Prefer bullets, tiny tables, mini flows, or checklists over dense prose when they reduce cognitive load.
- Avoid long paragraphs.
- Avoid inventories unless the user asked to compare options.

Visual thinking:
- Use visual structure only when it reduces explanation.
- Prefer before/after, cause -> fix, option -> tradeoff, flow, checklist, or file map when useful.
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
