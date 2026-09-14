import assert from "node:assert/strict";
import test from "node:test";
import {
  assertCommandSucceeded,
  decodeStartedAgent,
  decodeWorkspace,
  makePromptArgument,
} from "./logic.ts";

const success = (result: unknown) => ({
  code: 0,
  stdout: JSON.stringify({ id: "test", result }),
  stderr: "",
});

test("workspace responses retain exact topology identities", () => {
  assert.deepEqual(
    decodeWorkspace(
      success({
        workspace: { workspace_id: "w7" },
        tab: { tab_id: "w7:t1" },
        root_pane: { pane_id: "w7:p1" },
      }),
    ),
    { workspaceId: "w7", tabId: "w7:t1", paneId: "w7:p1" },
  );
});

test("started agent identity must match the created workspace", () => {
  const expected = {
    workspaceId: "w7",
    tabId: "w7:t1",
    paneId: "w7:p1",
    agentName: "handoff-12345678",
  };
  assert.deepEqual(
    decodeStartedAgent(
      success({
        agent: {
          workspace_id: "w7",
          tab_id: "w7:t1",
          pane_id: "w7:p1",
          name: "handoff-12345678",
          agent_session: { value: "/tmp/child.jsonl" },
        },
      }),
      expected,
    ),
    { ...expected, reportedSessionFile: "/tmp/child.jsonl" },
  );
  assert.throws(
    () =>
      decodeStartedAgent(
        success({
          agent: {
            workspace_id: "other",
            tab_id: "w7:t1",
            pane_id: "w7:p1",
            name: "handoff-12345678",
          },
        }),
        expected,
      ),
    /unexpected workspace/,
  );
});

test("command errors preserve Herdr's message", () => {
  assert.throws(
    () =>
      assertCommandSucceeded(
        {
          code: 1,
          stdout: "",
          stderr: JSON.stringify({ error: { code: "agent_blocked", message: "Agent is blocked" } }),
        },
        "herdr agent prompt",
      ),
    /Agent is blocked/,
  );
});

test("leading-hyphen prompts remain positional CLI arguments", () => {
  assert.equal(makePromptArgument("--review this"), " --review this");
  assert.equal(makePromptArgument("review this"), "review this");
});
