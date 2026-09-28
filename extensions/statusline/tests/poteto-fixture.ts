import assert from "node:assert/strict";
import { appendFileSync } from "node:fs";
import { join } from "node:path";
import { fauxAssistantMessage, fauxProvider } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { Check } from "typebox/value";

export default function fixture(pi: ExtensionAPI): void {
  const directory = process.env.POTETO_VERIFY_DIR;
  assert.ok(directory, "POTETO_VERIFY_DIR is required");
  const log = (event: object) =>
    appendFileSync(join(directory, "events.jsonl"), `${JSON.stringify(event)}\n`);
  const colors = (ctx: ExtensionContext) => ({
    on: ctx.ui.theme.fg("accent", "π"),
    off: ctx.ui.theme.fg("dim", "π"),
  });
  const provider = fauxProvider({
    provider: "poteto-fixture",
    models: [{ id: "scripted", reasoning: true }],
  });
  provider.setResponses(Array.from({ length: 8 }, () => fauxAssistantMessage("FIXTURE_REPLY")));
  pi.registerProvider(provider.provider);
  pi.on("session_start", (_event, ctx) =>
    log({ type: "ready", pid: process.pid, colors: colors(ctx) }),
  );
  pi.on("agent_settled", () => log({ type: "settled" }));
  pi.registerCommand("indicator-probe", {
    description: "Exercise the isolated Poteto footer fixture",
    async handler(args, ctx) {
      const recordAction = async (current: ExtensionContext) => {
        current.ui.setEditorText("");
        log({ type: "action", action: args, colors: colors(current) });
      };
      switch (args) {
        case "exit":
          ctx.shutdown();
          return;
        case "branch-on":
        case "branch-off": {
          const wanted = args === "branch-on";
          const shape = Type.Object({ enabled: Type.Literal(wanted) });
          const target = ctx.sessionManager
            .getEntries()
            .findLast(
              (entry) =>
                entry.type === "custom" &&
                entry.customType === "pstack-mode" &&
                Check(shape, entry.data),
            );
          assert.ok(target, "requested mode branch exists");
          assert.equal((await ctx.navigateTree(target.id, { summarize: false })).cancelled, false);
          break;
        }
        case "fork": {
          const target = ctx.sessionManager
            .getBranch()
            .findLast((entry) => entry.type === "message" && entry.message.role === "user");
          assert.ok(target, "fork point exists");
          assert.equal((await ctx.fork(target.id, { withSession: recordAction })).cancelled, false);
          return;
        }
        case "restore":
          assert.equal(
            (
              await ctx.switchSession(join(directory, "parent.jsonl"), {
                withSession: recordAction,
              })
            ).cancelled,
            false,
          );
          return;
        case "new":
          assert.equal((await ctx.newSession({ withSession: recordAction })).cancelled, false);
          return;
        case "invalid":
          pi.appendEntry("pstack-mode", { enabled: "true" });
          break;
        case "unrelated":
          pi.appendEntry("unrelated-mode", { enabled: false });
          break;
        case "theme":
          assert.equal(ctx.ui.setTheme("light").success, true);
          break;
        default:
          throw new Error(`Unknown fixture action ${args}`);
      }
      await recordAction(ctx);
    },
  });
}
