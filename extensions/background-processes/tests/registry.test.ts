import type { BashOperations } from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  BackgroundTaskRegistry,
  MAX_ACTIVE_TASKS,
  type TaskView,
} from "../src/registry.js";

interface PendingExecution {
  readonly onData: (data: Buffer) => void;
  readonly signal?: AbortSignal;
  readonly resolve: (result: { exitCode: number | null }) => void;
  readonly reject: (error: Error) => void;
  abortHandler?: () => void;
}

class FakeOperations implements BashOperations {
  readonly pending: PendingExecution[] = [];

  exec = vi.fn(async (
    _command: string,
    _cwd: string,
    options: Parameters<BashOperations["exec"]>[2],
  ): Promise<{ exitCode: number | null }> => {
    return new Promise((resolve, reject) => {
      const execution: PendingExecution = {
        onData: options.onData,
        signal: options.signal,
        resolve,
        reject,
      };
      execution.abortHandler = () => reject(new Error("aborted"));
      if (options.signal?.aborted) execution.abortHandler();
      else options.signal?.addEventListener("abort", execution.abortHandler, { once: true });
      this.pending.push(execution);
    });
  });

  complete(index: number, exitCode = 0, output = ""): void {
    const execution = this.pending[index]!;
    if (output) execution.onData(Buffer.from(output));
    if (execution.abortHandler) execution.signal?.removeEventListener("abort", execution.abortHandler);
    execution.resolve({ exitCode });
  }
}

const registries: BackgroundTaskRegistry[] = [];

afterEach(async () => {
  await Promise.all(registries.splice(0).map((registry) => registry.shutdown()));
  vi.restoreAllMocks();
});

function setup() {
  const operations = new FakeOperations();
  const notifications: TaskView[] = [];
  const registry = new BackgroundTaskRegistry(operations, (task) => notifications.push(task));
  registries.push(registry);
  return { operations, notifications, registry };
}

async function nextTurn(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
}

async function waitForFinalization(registry: BackgroundTaskRegistry, taskId: string): Promise<void> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    await Promise.resolve();
    const tasks = (registry as unknown as { tasks: Map<string, { finalizing: boolean }> }).tasks;
    if (tasks.get(taskId)?.finalizing) return;
  }
  throw new Error(`Task did not enter output finalization: ${taskId}`);
}

describe("BackgroundTaskRegistry", () => {
  test("returns immediately and publishes one unclaimed completion", async () => {
    const { operations, notifications, registry } = setup();

    const started = registry.run({ name: "Submit", command: "by change submit", cwd: "/repo" });

    expect(started.status).toBe("running");
    expect(started.id).toBe("bg-001");
    expect(operations.exec).toHaveBeenCalledOnce();
    operations.complete(0, 0, "published\n");
    await nextTurn();

    expect(registry.get(started.id)).toMatchObject({ status: "completed", exitCode: 0 });
    expect(registry.logs(started.id).content).toBe("published\n");
    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toMatchObject({ id: started.id, status: "completed" });
  });

  test("an active wait claims selected completions", async () => {
    const { operations, notifications, registry } = setup();
    const first = registry.run({ name: "First", command: "first", cwd: "/repo" });
    const second = registry.run({ name: "Second", command: "second", cwd: "/repo" });

    const waiting = registry.wait({ taskIds: [first.id] });
    operations.complete(1, 0, "second done\n");
    await nextTurn();
    expect(notifications).toHaveLength(1);
    expect(notifications[0]?.id).toBe(second.id);

    operations.complete(0, 0, "first done\n");
    const result = await waiting;

    expect(result.timedOut).toBe(false);
    expect(result.tasks).toMatchObject([{ id: first.id, status: "completed" }]);
    expect(result.outputs[0]?.output.content).toBe("first done\n");
    expect(notifications).toHaveLength(1);
  });

  test("a wait can claim completion while captured output is finalizing", async () => {
    const { operations, notifications, registry } = setup();
    const task = registry.run({ name: "Verbose", command: "verbose", cwd: "/repo" });

    operations.complete(0, 0, "x".repeat(100_000));
    await waitForFinalization(registry, task.id);
    expect(registry.get(task.id).status).toBe("running");

    const result = await registry.wait({ taskIds: [task.id] });

    expect(result.tasks).toMatchObject([{ id: task.id, status: "completed" }]);
    expect(notifications).toEqual([]);
  });

  test("kill during output finalization preserves the command outcome", async () => {
    const { operations, notifications, registry } = setup();
    const task = registry.run({ name: "Verbose", command: "verbose", cwd: "/repo" });

    operations.complete(0, 0, "x".repeat(100_000));
    await waitForFinalization(registry, task.id);
    expect(registry.get(task.id).status).toBe("running");

    const result = await registry.kill(task.id);

    expect(result).toMatchObject({ id: task.id, status: "completed", exitCode: 0 });
    expect(notifications).toEqual([]);
  });

  test("omitted task IDs snapshot all currently running tasks", async () => {
    const { operations, notifications, registry } = setup();
    const first = registry.run({ name: "First", command: "first", cwd: "/repo" });
    const waiting = registry.wait({});
    const later = registry.run({ name: "Later", command: "later", cwd: "/repo" });

    operations.complete(0);
    const result = await waiting;
    expect(result.tasks.map((task) => task.id)).toEqual([first.id]);

    operations.complete(1);
    await nextTurn();
    expect(notifications.map((task) => task.id)).toEqual([later.id]);
  });

  test("a wait timeout leaves tasks running and eligible for notification", async () => {
    const { operations, notifications, registry } = setup();
    const task = registry.run({ name: "Slow", command: "slow", cwd: "/repo" });

    const result = await registry.wait({ taskIds: [task.id], timeoutSeconds: 0.01 });
    expect(result.timedOut).toBe(true);
    expect(result.tasks[0]?.status).toBe("running");

    operations.complete(0);
    await nextTurn();
    expect(notifications).toMatchObject([{ id: task.id, status: "completed" }]);
  });

  test("cancelling a wait does not cancel its task or lose its completion notification", async () => {
    const { notifications, operations, registry } = setup();
    const task = registry.run({ name: "Slow", command: "slow", cwd: "/repo" });
    const controller = new AbortController();
    const waiting = registry.wait({ taskIds: [task.id], signal: controller.signal });

    controller.abort();
    await expect(waiting).rejects.toThrow("Tasks continue running");
    expect(registry.get(task.id).status).toBe("running");
    expect(operations.pending[0]?.signal?.aborted).toBe(false);

    operations.complete(0);
    await nextTurn();
    expect(notifications).toMatchObject([{ id: task.id, status: "completed" }]);
  });

  test("cancelling bg_kill returns control while preserving eventual task notification", async () => {
    const { notifications, registry } = setup();
    const task = registry.run({ name: "Server", command: "serve", cwd: "/repo" });
    const controller = new AbortController();
    controller.abort();

    await expect(registry.kill(task.id, controller.signal)).rejects.toThrow("kill was cancelled");
    await nextTurn();

    expect(registry.get(task.id).status).toBe("killed");
    expect(notifications).toMatchObject([{ id: task.id, status: "killed" }]);
  });

  test("kill is idempotent and aborts the owned command", async () => {
    const { notifications, registry } = setup();
    const task = registry.run({ name: "Server", command: "serve", cwd: "/repo" });

    const killed = await registry.kill(task.id);
    const killedAgain = await registry.kill(task.id);

    expect(killed).toMatchObject({ status: "killed", error: "Killed by bg_kill." });
    expect(killedAgain).toMatchObject({ status: "killed" });
    expect(notifications).toEqual([]);
  });

  test("a failed command publishes its exit status", async () => {
    const { operations, notifications, registry } = setup();
    const task = registry.run({ name: "Failure", command: "false", cwd: "/repo" });

    operations.complete(0, 17, "failed\n");
    await nextTurn();

    expect(registry.get(task.id)).toMatchObject({
      status: "failed",
      exitCode: 17,
      error: "Command exited with code 17.",
    });
    expect(notifications).toMatchObject([{ id: task.id, status: "failed" }]);
  });

  test("shutdown kills active tasks without completion notifications", async () => {
    const { notifications, registry } = setup();
    registry.run({ name: "Server", command: "serve", cwd: "/repo" });

    await registry.shutdown();

    expect(registry.list()).toEqual([]);
    expect(notifications).toEqual([]);
  });

  test("rejects launches beyond the active task limit", () => {
    const { registry } = setup();
    for (let index = 0; index < MAX_ACTIVE_TASKS; index += 1) {
      registry.run({ name: `Task ${index}`, command: "sleep", cwd: "/repo" });
    }

    expect(() => registry.run({ name: "Excess", command: "sleep", cwd: "/repo" }))
      .toThrow(`At most ${MAX_ACTIVE_TASKS}`);
  });

  test("already-terminal selected tasks return immediately", async () => {
    const { operations, registry } = setup();
    const task = registry.run({ name: "Quick", command: "quick", cwd: "/repo" });
    operations.complete(0);
    await nextTurn();

    const result = await registry.wait({ taskIds: [task.id] });

    expect(result.timedOut).toBe(false);
    expect(result.tasks).toMatchObject([{ id: task.id, status: "completed" }]);
  });

  test("unknown task IDs fail clearly", async () => {
    const { registry } = setup();

    expect(() => registry.get("bg-999")).toThrow("Unknown background task");
    await expect(registry.wait({ taskIds: ["bg-999"] })).rejects.toThrow("Unknown background task");
  });
});
