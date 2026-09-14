import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { launchSession, prepareSession } from "./index.ts";
import type { CommandResult } from "./logic.ts";

const usage = {
  input: 1,
  output: 1,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 2,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

function assistant(content: Array<{ type: "text"; text: string } | { type: "toolCall"; id: string; name: string; arguments: Record<string, never> }>) {
  return {
    role: "assistant" as const,
    content,
    api: "test",
    provider: "test",
    model: "fixture",
    usage,
    stopReason: content.some((part) => part.type === "toolCall") ? ("toolUse" as const) : ("stop" as const),
    timestamp: Date.now(),
  };
}

test("clean preparation creates an empty parentless session", async () => {
  const root = await mkdtemp(join(tmpdir(), "pi-session-handoff-clean-"));
  try {
    const parent = SessionManager.inMemory(root);
    const prepared = await prepareSession(
      { cwd: root, manager: parent },
      "unused",
      false,
      join(root, "sessions"),
    );
    const child = SessionManager.open(prepared.sessionFile);
    assert.equal(child.getSessionId(), prepared.sessionId);
    assert.equal(child.getHeader()?.parentSession, undefined);
    assert.deepEqual(child.getEntries(), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("fork preparation ends before the invoking assistant entry", async () => {
  const root = await mkdtemp(join(tmpdir(), "pi-session-handoff-fork-"));
  try {
    const sessions = join(root, "sessions");
    const targetCwd = join(root, "other-project");
    await mkdir(targetCwd);
    const parent = SessionManager.create(root, sessions);
    parent.appendMessage({ role: "user", content: "Initial question", timestamp: 1 });
    parent.appendMessage(assistant([{ type: "text", text: "Prior answer" }]));
    parent.appendMessage({ role: "user", content: "Start a separate discussion", timestamp: 2 });
    parent.appendMessage(
      assistant([
        { type: "text", text: "I will start it." },
        { type: "toolCall", id: "launch-call", name: "start_session", arguments: {} },
        { type: "toolCall", id: "sibling-call", name: "other_tool", arguments: {} },
      ]),
    );
    const parentEntries = parent.getEntries();

    const prepared = await prepareSession(
      { cwd: root, manager: parent },
      "launch-call",
      true,
      sessions,
      targetCwd,
    );
    const child = SessionManager.open(prepared.sessionFile);
    const serialized = JSON.stringify(child.getBranch());
    assert.match(serialized, /Initial question/);
    assert.match(serialized, /Prior answer/);
    assert.match(serialized, /Start a separate discussion/);
    assert.doesNotMatch(serialized, /launch-call|sibling-call|I will start it/);
    assert.match(serialized, /SESSION HANDOFF BOUNDARY/);
    assert.match(serialized, /destination session already created/);
    assert.equal(child.getHeader()?.cwd, targetCwd);
    assert.equal(child.getHeader()?.parentSession, parent.getSessionFile());
    assert.deepEqual(parent.getEntries(), parentEntries, "preparing the fork must not mutate the origin");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("launch creates one workspace, starts Pi there, and submits one prompt", async () => {
  const root = await mkdtemp(join(tmpdir(), "pi-session-handoff-launch-"));
  const saved = saveHerdrEnv();
  try {
    installHerdrEnv();
    const targetCwd = join(root, "selected-project");
    await mkdir(targetCwd);
    const calls: Array<{ command: string; args: string[] }> = [];
    const executor = {
      async exec(command: string, args: string[]): Promise<CommandResult> {
        calls.push({ command, args });
        if (args[0] === "workspace") {
          return success({
            workspace: { workspace_id: "w-new" },
            tab: { tab_id: "w-new:t1" },
            root_pane: { pane_id: "w-new:p1" },
          });
        }
        if (args[0] === "agent" && args[1] === "start") {
          const sessionFile = args[args.indexOf("--session") + 1];
          return success({
            agent: {
              workspace_id: "w-new",
              tab_id: "w-new:t1",
              pane_id: "w-new:p1",
              name: args[2],
              agent_session: { value: sessionFile },
            },
          });
        }
        return success({ agent: { pane_id: "w-new:p1" } });
      },
    };

    const identity = await launchSession(
      executor,
      {
        toolCallId: "unused",
        prompt: "Investigate the other concern",
        cwd: "selected-project",
        forkContext: false,
        sessionDir: join(root, "sessions"),
      },
      { cwd: root, manager: SessionManager.inMemory(root) },
    );

    assert.equal(identity.workspaceId, "w-new");
    assert.equal(identity.paneId, "w-new:p1");
    assert.equal(identity.cwd, targetCwd);
    assert.equal(calls.length, 3);
    assert.deepEqual(calls[0]?.args.slice(0, 4), ["workspace", "create", "--cwd", targetCwd]);
    assert.deepEqual(calls[2]?.args, ["agent", "prompt", "w-new:p1", "Investigate the other concern"]);
    assert.equal(calls.some((call) => call.args.includes("close")), false);
  } finally {
    restoreHerdrEnv(saved);
    await rm(root, { recursive: true, force: true });
  }
});

test("a post-creation failure reports known identity without cleanup or retry", async () => {
  const root = await mkdtemp(join(tmpdir(), "pi-session-handoff-failure-"));
  const saved = saveHerdrEnv();
  try {
    installHerdrEnv();
    const calls: string[][] = [];
    const executor = {
      async exec(_command: string, args: string[]): Promise<CommandResult> {
        calls.push(args);
        if (args[0] === "workspace") {
          return success({
            workspace: { workspace_id: "w-uncertain" },
            tab: { tab_id: "w-uncertain:t1" },
            root_pane: { pane_id: "w-uncertain:p1" },
          });
        }
        return {
          code: 1,
          stdout: "",
          stderr: JSON.stringify({ error: { message: "startup timed out" } }),
        };
      },
    };

    await assert.rejects(
      launchSession(
        executor,
        {
          toolCallId: "unused",
          prompt: "Continue elsewhere",
          forkContext: false,
          sessionDir: join(root, "sessions"),
        },
        { cwd: root, manager: SessionManager.inMemory(root) },
      ),
      /w-uncertain.*do not retry|do not retry.*w-uncertain/,
    );
    assert.equal(calls.length, 2);
    assert.equal(calls.some((args) => args.includes("close")), false);
  } finally {
    restoreHerdrEnv(saved);
    await rm(root, { recursive: true, force: true });
  }
});

function success(result: unknown): CommandResult {
  return { code: 0, stdout: JSON.stringify({ id: "test", result }), stderr: "" };
}

function saveHerdrEnv(): Record<string, string | undefined> {
  return {
    HERDR_ENV: process.env.HERDR_ENV,
    HERDR_SOCKET_PATH: process.env.HERDR_SOCKET_PATH,
    HERDR_PANE_ID: process.env.HERDR_PANE_ID,
    HERDR_BIN_PATH: process.env.HERDR_BIN_PATH,
  };
}

function installHerdrEnv(): void {
  process.env.HERDR_ENV = "1";
  process.env.HERDR_SOCKET_PATH = "/tmp/herdr-test.sock";
  process.env.HERDR_PANE_ID = "w-parent:p1";
  process.env.HERDR_BIN_PATH = "herdr-test";
}

function restoreHerdrEnv(saved: Record<string, string | undefined>): void {
  for (const [name, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}
