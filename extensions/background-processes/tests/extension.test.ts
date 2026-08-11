import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BashOperations, ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, test, vi } from "vitest";
import { registerBackgroundProcesses } from "../src/index.js";

interface PendingExecution {
  readonly onData: (data: Buffer) => void;
  readonly signal?: AbortSignal;
  readonly resolve: (result: { exitCode: number | null }) => void;
  readonly reject: (error: Error) => void;
}

class FakeOperations implements BashOperations {
  readonly pending: PendingExecution[] = [];

  async exec(
    _command: string,
    _cwd: string,
    options: Parameters<BashOperations["exec"]>[2],
  ): Promise<{ exitCode: number | null }> {
    return new Promise((resolve, reject) => {
      const pending = { onData: options.onData, signal: options.signal, resolve, reject };
      if (options.signal?.aborted) reject(new Error("aborted"));
      else options.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
      this.pending.push(pending);
    });
  }

  complete(index: number, output = "done\n", exitCode = 0): void {
    const pending = this.pending[index]!;
    pending.onData(Buffer.from(output));
    pending.resolve({ exitCode });
  }
}

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
  vi.restoreAllMocks();
});

function setup() {
  const tools = new Map<string, any>();
  const commands = new Map<string, any>();
  const handlers = new Map<string, (...args: any[]) => unknown>();
  const sentMessages: Array<{ message: any; options: any }> = [];
  const api = {
    registerTool: vi.fn((tool: any) => tools.set(tool.name, tool)),
    registerCommand: vi.fn((name: string, command: any) => commands.set(name, command)),
    on: vi.fn((event: string, handler: (...args: any[]) => unknown) => handlers.set(event, handler)),
    sendMessage: vi.fn((message: any, options: any) => sentMessages.push({ message, options })),
  } as unknown as ExtensionAPI;
  const operations = new FakeOperations();
  registerBackgroundProcesses(api, operations);
  return { api, commands, handlers, operations, sentMessages, tools };
}

function context(cwd: string, idle = true) {
  const ui = { notify: vi.fn(), setWidget: vi.fn() };
  return {
    ctx: {
      cwd,
      isIdle: () => idle,
      model: { provider: "openai-codex", id: "gpt-test" },
      thinkingLevel: "high",
      sessionManager: {
        getSessionId: () => "session-1",
        getSessionFile: () => "/tmp/session.jsonl",
      },
      ui,
    },
    ui,
  };
}

async function execute(tool: any, params: unknown, ctx: unknown, signal?: AbortSignal) {
  return tool.execute("call-1", params, signal, undefined, ctx);
}

async function nextTurn(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
}

describe("background process extension", () => {
  test("registers only the approved tools, command, and lifecycle handler", () => {
    const { commands, handlers, tools } = setup();

    expect([...tools.keys()]).toEqual(["bg_run", "bg_wait", "bg_status", "bg_logs", "bg_kill"]);
    expect([...commands.keys()]).toEqual(["ps"]);
    expect([...handlers.keys()]).toEqual(["agent_settled", "session_shutdown"]);
    expect(tools.get("bg_run").promptGuidelines).toContain(
      "Use bash for ordinary commands, including slow commands that should finish in the current turn.",
    );
    expect(tools.get("bg_run").description).toContain("At most 8 tasks run concurrently");
    expect(tools.get("bg_run").parameters.properties.timeoutSeconds.description).toContain(
      "task is terminated with status timed_out",
    );
    expect(tools.get("bg_wait").description).toContain("tasks started later are excluded");
    expect(tools.get("bg_wait").description).toContain("multi-task result gives summaries");
  });

  test("shows one above-input status line while tasks run and clears it on completion", async () => {
    const root = await mkdtemp(join(tmpdir(), "pi-bg-extension-"));
    temporaryDirectories.push(root);
    const { operations, tools } = setup();
    const { ctx, ui } = context(root);

    await execute(tools.get("bg_run"), { name: "Integration tests", command: "test" }, ctx);

    expect(ui.setWidget).toHaveBeenLastCalledWith(
      "pi-background-processes",
      [expect.stringMatching(/^Background: 1 running - bg-001 "Integration tests" - \/ps for details$/)],
      { placement: "aboveEditor" },
    );

    operations.complete(0);
    await nextTurn();

    expect(ui.setWidget).toHaveBeenLastCalledWith("pi-background-processes", undefined);
  });

  test("an unclaimed completion queues a follow-up and triggers a turn", async () => {
    const root = await mkdtemp(join(tmpdir(), "pi-bg-extension-"));
    temporaryDirectories.push(root);
    const { operations, sentMessages, tools } = setup();
    const { ctx } = context(root);

    const launched = await execute(tools.get("bg_run"), { name: "Submit", command: "submit" }, ctx);
    operations.complete(0, "result\n");
    await nextTurn();

    expect(launched.content[0].text).toContain("Started bg-001");
    expect(sentMessages).toHaveLength(1);
    expect(sentMessages[0]).toMatchObject({
      message: { details: { taskId: "bg-001", status: "completed" } },
      options: { deliverAs: "followUp", triggerTurn: true },
    });
    expect(sentMessages[0]?.message.content).not.toContain("result\n");
  });

  test("a wait claims a completion deferred during the current parent turn", async () => {
    const root = await mkdtemp(join(tmpdir(), "pi-bg-extension-"));
    temporaryDirectories.push(root);
    const { handlers, operations, sentMessages, tools } = setup();
    const { ctx } = context(root, false);

    await execute(tools.get("bg_run"), { name: "Submit", command: "submit" }, ctx);
    operations.complete(0, "accepted\n");
    await nextTurn();
    expect(sentMessages).toEqual([]);

    const result = await execute(tools.get("bg_wait"), { taskIds: ["bg-001"] }, ctx);
    await handlers.get("agent_settled")?.({}, ctx);

    expect(result.content[0].text).toContain("accepted");
    expect(sentMessages).toEqual([]);
  });

  test("an unclaimed completion deferred during a parent turn is delivered when the turn settles", async () => {
    const root = await mkdtemp(join(tmpdir(), "pi-bg-extension-"));
    temporaryDirectories.push(root);
    const { handlers, operations, sentMessages, tools } = setup();
    const { ctx } = context(root, false);

    await execute(tools.get("bg_run"), { name: "Submit", command: "submit" }, ctx);
    operations.complete(0);
    await nextTurn();
    expect(sentMessages).toEqual([]);

    await handlers.get("agent_settled")?.({}, ctx);
    expect(sentMessages).toHaveLength(1);
  });

  test("bg_wait claims completion and returns one task's output", async () => {
    const root = await mkdtemp(join(tmpdir(), "pi-bg-extension-"));
    temporaryDirectories.push(root);
    const { operations, sentMessages, tools } = setup();
    const { ctx } = context(root);
    await execute(tools.get("bg_run"), { name: "Submit", command: "submit" }, ctx);

    const waiting = execute(tools.get("bg_wait"), { taskIds: ["bg-001"] }, ctx);
    operations.complete(0, "accepted\n");
    const result = await waiting;

    expect(result.content[0].text).toContain("accepted");
    expect(sentMessages).toEqual([]);
  });

  test("bg_logs exposes captured output and bg_kill stops an active task", async () => {
    const root = await mkdtemp(join(tmpdir(), "pi-bg-extension-"));
    temporaryDirectories.push(root);
    const { operations, tools } = setup();
    const { ctx } = context(root);

    await execute(tools.get("bg_run"), { name: "Output", command: "output" }, ctx);
    operations.complete(0, "captured\n");
    await nextTurn();
    const logs = await execute(tools.get("bg_logs"), { taskId: "bg-001" }, ctx);

    await execute(tools.get("bg_run"), { name: "Server", command: "serve" }, ctx);
    const killed = await execute(tools.get("bg_kill"), { taskId: "bg-002" }, ctx);

    expect(logs.content[0].text).toContain("captured");
    expect(killed.content[0].text).toContain("bg-002 killed");
    expect(operations.pending[1]?.signal?.aborted).toBe(true);
  });

  test("bg_status and /ps expose retained task state", async () => {
    const root = await mkdtemp(join(tmpdir(), "pi-bg-extension-"));
    temporaryDirectories.push(root);
    const { commands, tools } = setup();
    const { ctx, ui } = context(root);
    await execute(tools.get("bg_run"), { name: "Server", command: "serve" }, ctx);

    const status = await execute(tools.get("bg_status"), {}, ctx);
    await commands.get("ps").handler("", ctx);

    expect(status.content[0].text).toContain("bg-001 running");
    expect(ui.notify).toHaveBeenCalledWith(expect.stringContaining("bg-001 running"), "info");
  });

  test("does not create task state in the working directory", async () => {
    const root = await mkdtemp(join(tmpdir(), "pi-bg-project-"));
    temporaryDirectories.push(root);
    const { operations, tools } = setup();
    const { ctx } = context(root);
    await execute(tools.get("bg_run"), { name: "Submit", command: "submit" }, ctx);
    operations.complete(0);
    await nextTurn();

    expect(await readdir(root)).toEqual([]);
  });

  test("session shutdown cancels active work", async () => {
    const root = await mkdtemp(join(tmpdir(), "pi-bg-extension-"));
    temporaryDirectories.push(root);
    const { handlers, operations, sentMessages, tools } = setup();
    const { ctx } = context(root);
    await execute(tools.get("bg_run"), { name: "Server", command: "serve" }, ctx);

    await handlers.get("session_shutdown")?.({}, ctx);

    expect(operations.pending[0]?.signal?.aborted).toBe(true);
    expect(sentMessages).toEqual([]);
  });
});
