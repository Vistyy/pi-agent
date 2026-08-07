import type { BashOperations } from "@earendil-works/pi-coding-agent";
import { TaskOutput, type OutputSnapshot } from "./output.js";

export const MAX_ACTIVE_TASKS = 8;
export const MAX_RETAINED_TASKS = 32;
const SHUTDOWN_WAIT_MS = 2_000;

export type TaskStatus =
  | "starting"
  | "running"
  | "completed"
  | "failed"
  | "timed_out"
  | "killed";

export interface TaskView {
  readonly id: string;
  readonly name: string;
  readonly command: string;
  readonly cwd: string;
  readonly status: TaskStatus;
  readonly createdAt: number;
  readonly startedAt?: number;
  readonly completedAt?: number;
  readonly timeoutSeconds?: number;
  readonly exitCode?: number | null;
  readonly error?: string;
}

export interface RunTaskInput {
  readonly name: string;
  readonly command: string;
  readonly cwd: string;
  readonly timeoutSeconds?: number;
  readonly env?: NodeJS.ProcessEnv;
}

export interface WaitInput {
  readonly taskIds?: readonly string[];
  readonly timeoutSeconds?: number;
  readonly signal?: AbortSignal;
}

export interface WaitResult {
  readonly tasks: readonly TaskView[];
  readonly outputs: readonly { readonly taskId: string; readonly output: OutputSnapshot }[];
  readonly timedOut: boolean;
}

interface TaskRecord {
  readonly id: string;
  readonly name: string;
  readonly command: string;
  readonly cwd: string;
  readonly createdAt: number;
  readonly timeoutSeconds?: number;
  readonly env?: NodeJS.ProcessEnv;
  readonly controller: AbortController;
  readonly output: TaskOutput;
  readonly completion: Promise<TaskRecord>;
  readonly resolveCompletion: (task: TaskRecord) => void;
  status: TaskStatus;
  startedAt?: number;
  completedAt?: number;
  exitCode?: number | null;
  error?: string;
  killReason?: "user" | "shutdown";
  finalizing: boolean;
  waitClaims: number;
  notificationSent: boolean;
}

export type CompletionSink = (task: TaskView) => void;

function isTerminal(status: TaskStatus): boolean {
  return status === "completed" || status === "failed" || status === "timed_out" || status === "killed";
}

function validateTimeout(timeoutSeconds: number | undefined): void {
  if (timeoutSeconds === undefined) return;
  if (!Number.isFinite(timeoutSeconds) || timeoutSeconds <= 0) {
    throw new Error("timeoutSeconds must be a positive finite number.");
  }
}

export class BackgroundTaskRegistry {
  private readonly tasks = new Map<string, TaskRecord>();
  private nextId = 1;
  private shuttingDown = false;

  constructor(
    private readonly operations: BashOperations,
    private readonly onUnclaimedCompletion: CompletionSink,
    private readonly onTasksChanged?: () => void,
  ) {}

  run(input: RunTaskInput): TaskView {
    if (this.shuttingDown) throw new Error("Background task manager is shutting down.");
    validateTimeout(input.timeoutSeconds);
    if (!input.name.trim()) throw new Error("Task name must not be empty.");
    if (!input.command.trim()) throw new Error("Command must not be empty.");
    if (this.activeTasks().length >= MAX_ACTIVE_TASKS) {
      throw new Error(`At most ${MAX_ACTIVE_TASKS} background tasks may run at once.`);
    }

    const id = `bg-${String(this.nextId).padStart(3, "0")}`;
    this.nextId += 1;
    let resolveCompletion!: (task: TaskRecord) => void;
    const completion = new Promise<TaskRecord>((resolve) => {
      resolveCompletion = resolve;
    });
    const task: TaskRecord = {
      id,
      name: input.name.trim(),
      command: input.command,
      cwd: input.cwd,
      createdAt: Date.now(),
      ...(input.timeoutSeconds === undefined ? {} : { timeoutSeconds: input.timeoutSeconds }),
      ...(input.env === undefined ? {} : { env: input.env }),
      controller: new AbortController(),
      output: new TaskOutput(),
      completion,
      resolveCompletion,
      status: "starting",
      finalizing: false,
      waitClaims: 0,
      notificationSent: false,
    };
    this.tasks.set(id, task);
    void this.execute(task);
    this.notifyTasksChanged();
    return this.view(task);
  }

  list(): readonly TaskView[] {
    return [...this.tasks.values()]
      .sort((left, right) => left.createdAt - right.createdAt)
      .map((task) => this.view(task));
  }

  get(taskId: string): TaskView {
    return this.view(this.requireTask(taskId));
  }

  logs(taskId: string): OutputSnapshot {
    return this.requireTask(taskId).output.snapshot({ persistIfTruncated: true });
  }

  async kill(taskId: string): Promise<TaskView> {
    const task = this.requireTask(taskId);
    if (isTerminal(task.status)) return this.view(task);

    task.waitClaims += 1;
    try {
      if (!task.finalizing) {
        task.killReason = "user";
        task.controller.abort();
      }
      return this.view(await task.completion);
    } finally {
      task.waitClaims = Math.max(0, task.waitClaims - 1);
      this.prune();
    }
  }

  async wait(input: WaitInput): Promise<WaitResult> {
    validateTimeout(input.timeoutSeconds);
    const requestedIds = [...new Set(input.taskIds?.filter(Boolean) ?? [])];
    const selected = requestedIds.length > 0
      ? requestedIds.map((id) => this.requireTask(id))
      : this.activeTasks();

    if (selected.length === 0) return { tasks: [], outputs: [], timedOut: false };

    const pending = selected.filter((task) => !isTerminal(task.status));
    for (const task of pending) task.waitClaims += 1;

    let timedOut = false;
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    let abortHandler: (() => void) | undefined;
    try {
      if (pending.length > 0) {
        const completions = Promise.all(pending.map((task) => task.completion)).then(() => "completed" as const);
        const outcomes: Array<Promise<"completed" | "timed_out" | "aborted">> = [completions];
        if (input.timeoutSeconds !== undefined) {
          outcomes.push(new Promise((resolve) => {
            timeoutHandle = setTimeout(() => resolve("timed_out"), input.timeoutSeconds! * 1_000);
          }));
        }
        if (input.signal) {
          outcomes.push(new Promise((resolve) => {
            abortHandler = () => resolve("aborted");
            if (input.signal!.aborted) abortHandler();
            else input.signal!.addEventListener("abort", abortHandler, { once: true });
          }));
        }
        const outcome = await Promise.race(outcomes);
        if (outcome === "aborted") {
          throw new Error("Background wait was cancelled. Tasks continue running.");
        }
        timedOut = outcome === "timed_out";
      }

      return {
        tasks: selected.map((task) => this.view(task)),
        outputs: selected.map((task) => ({
          taskId: task.id,
          output: task.output.snapshot({ persistIfTruncated: true }),
        })),
        timedOut,
      };
    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      if (input.signal && abortHandler) input.signal.removeEventListener("abort", abortHandler);
      for (const task of pending) task.waitClaims = Math.max(0, task.waitClaims - 1);
      this.prune();
    }
  }

  async shutdown(): Promise<void> {
    if (this.shuttingDown) return;
    this.shuttingDown = true;

    const active = this.activeTasks();
    for (const task of active) {
      if (!task.finalizing) {
        task.killReason = "shutdown";
        task.controller.abort();
      }
    }

    await Promise.race([
      Promise.allSettled(active.map((task) => task.completion)),
      new Promise((resolve) => setTimeout(resolve, SHUTDOWN_WAIT_MS)),
    ]);
    await Promise.allSettled([...this.tasks.values()].map((task) => task.output.dispose()));
    this.tasks.clear();
    this.notifyTasksChanged();
  }

  private async execute(task: TaskRecord): Promise<void> {
    task.status = "running";
    task.startedAt = Date.now();
    let nextStatus: TaskStatus;
    let nextError: string | undefined;
    try {
      const result = await this.operations.exec(task.command, task.cwd, {
        onData: (data) => task.output.append(data),
        signal: task.controller.signal,
        timeout: task.timeoutSeconds,
        ...(task.env === undefined ? {} : { env: task.env }),
      });
      task.exitCode = result.exitCode;
      if (result.exitCode === 0) {
        nextStatus = "completed";
      } else {
        nextStatus = "failed";
        nextError = result.exitCode === null
          ? "Command ended without an exit code."
          : `Command exited with code ${result.exitCode}.`;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (task.killReason || message === "aborted") {
        nextStatus = "killed";
        nextError = "Killed by bg_kill.";
      } else if (message.startsWith("timeout:")) {
        nextStatus = "timed_out";
        nextError = `Command timed out after ${task.timeoutSeconds} seconds.`;
      } else {
        nextStatus = "failed";
        nextError = message;
      }
    } finally {
      task.finalizing = true;
      task.output.finish();
      await task.output.close();
      if (task.killReason) {
        nextStatus = "killed";
        nextError = task.killReason === "shutdown"
          ? "Killed during Pi session shutdown or reload."
          : "Killed by bg_kill.";
      }
      task.status = nextStatus!;
      task.error = nextError;
      task.completedAt = Date.now();
      this.notifyTasksChanged();
      task.resolveCompletion(task);
      if (!this.shuttingDown && task.waitClaims === 0 && !task.notificationSent) {
        task.notificationSent = true;
        try {
          this.onUnclaimedCompletion(this.view(task));
        } catch {
          // Completion state remains available through bg_status and bg_logs.
        }
      }
      this.prune();
    }
  }

  private activeTasks(): TaskRecord[] {
    return [...this.tasks.values()].filter((task) => !isTerminal(task.status));
  }

  private notifyTasksChanged(): void {
    try {
      this.onTasksChanged?.();
    } catch {
      // Task lifecycle does not depend on presentation updates.
    }
  }

  private requireTask(taskId: string): TaskRecord {
    const task = this.tasks.get(taskId);
    if (!task) throw new Error(`Unknown background task: ${taskId}`);
    return task;
  }

  private view(task: TaskRecord): TaskView {
    return {
      id: task.id,
      name: task.name,
      command: task.command,
      cwd: task.cwd,
      status: task.status,
      createdAt: task.createdAt,
      ...(task.startedAt === undefined ? {} : { startedAt: task.startedAt }),
      ...(task.completedAt === undefined ? {} : { completedAt: task.completedAt }),
      ...(task.timeoutSeconds === undefined ? {} : { timeoutSeconds: task.timeoutSeconds }),
      ...(task.exitCode === undefined ? {} : { exitCode: task.exitCode }),
      ...(task.error === undefined ? {} : { error: task.error }),
    };
  }

  private prune(): void {
    const terminal = [...this.tasks.values()]
      .filter((task) => isTerminal(task.status) && task.waitClaims === 0)
      .sort((left, right) => (left.completedAt ?? 0) - (right.completedAt ?? 0));
    const excess = Math.max(0, terminal.length - MAX_RETAINED_TASKS);
    for (const task of terminal.slice(0, excess)) {
      this.tasks.delete(task.id);
      void task.output.dispose();
    }
  }
}
