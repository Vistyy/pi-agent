import assert from "node:assert/strict";
import { test } from "vitest";
import { ReviewCommands } from "../src/commands.ts";
import { normalizeReview } from "../src/model.ts";

test("creates one unfocused private Herdr tab and launches Tuicr to readiness", async () => {
  const previous = process.env.HERDR_ENV;
  process.env.HERDR_ENV = "1";
  const calls: Array<{ command: string; args: string[] }> = [];
  try {
    const commands = new ReviewCommands({
      async exec(command: string, args: string[]) {
        calls.push({ command, args });
        if (args[0] === "pane" && args[1] === "current") {
          return { code: 0, stdout: JSON.stringify({ result: { pane: { workspace_id: "workspace" } } }), stderr: "" };
        }
        if (args[0] === "tab" && args[1] === "create") {
          return { code: 0, stdout: JSON.stringify({ result: {
            tab: { tab_id: "workspace:tab" }, root_pane: { pane_id: "workspace:pane" },
          } }), stderr: "" };
        }
        if (args[0] === "pane" && args[1] === "run") return { code: 0, stdout: "", stderr: "" };
        if (command === "env") return { code: 0, stdout: JSON.stringify([{ slug: "exact", active: true }]), stderr: "" };
        if (args[0] === "tab" && args[1] === "close") return { code: 0, stdout: JSON.stringify({ result: {} }), stderr: "" };
        throw new Error(`unexpected command ${command} ${args.join(" ")}`);
      },
    } as any);
    const review = await commands.launch(normalizeReview("/repo", { target: { kind: "workingTree" } }), "pi-session");
    assert.equal(review.sessionId, "exact");
    assert.deepEqual({ tabId: review.tabId, paneId: review.paneId }, { tabId: "workspace:tab", paneId: "workspace:pane" });
    const create = calls.find((call) => call.args[0] === "tab" && call.args[1] === "create")!;
    assert.ok(create.args.includes("--no-focus"));
    assert.ok(create.args.includes(`XDG_DATA_HOME=${review.dataHome}`));
    const run = calls.find((call) => call.args[0] === "pane" && call.args[1] === "run")!;
    assert.equal(run.args[2], review.paneId);
    assert.match(run.args[3]!, /--working-tree/);
    assert.match(run.args[3]!, /--stdout/);
    assert.match(run.args[3]!, /--no-update-check/);
    assert.equal(calls.some((call) => call.command === "git" || call.args[0] === "--version"), false);
    await commands.cleanup(review);
  } finally {
    if (previous === undefined) delete process.env.HERDR_ENV;
    else process.env.HERDR_ENV = previous;
  }
});
