import {
  createLocalBashOperations,
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  formatSize,
  type BashOperations,
  type ExtensionAPI,
  type ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import {
  BackgroundTaskRegistry,
  MAX_ACTIVE_TASKS,
  MAX_RETAINED_TASKS,
  type TaskView,
  type WaitResult,
} from "./registry.js";
import type { OutputSnapshot } from "./output.js";

const MAX_TIMEOUT_SECONDS = 2_147_483_647 / 1_000;
const completionMessageType = "pi-background-process-completion";
const statusWidgetKey = "pi-background-processes";
const STATUS_TASK_LIMIT = 3;

const optionalRunTimeout = Type.Optional(Type.Number({
  description: "Maximum execution time in seconds. If exceeded, the task is terminated with status timed_out. Omit for no limit.",
  minimum: 0.001,
  maximum: MAX_TIMEOUT_SECONDS,
}));

const runSchema = Type.Object({
  name: Type.String({
    description: "Short human-readable task label shown in the status line, /ps, and completion message. This is not a long description.",
    minLength: 1,
    maxLength: 80,
  }),
  command: Type.String({ description: "Long-running Bash command to execute.", minLength: 1 }),
  timeoutSeconds: optionalRunTimeout,
});

const statusSchema = Type.Object({
  taskId: Type.Optional(Type.String({ description: "Task ID. Omit to list all retained tasks." })),
});

const taskIdSchema = Type.Object({
  taskId: Type.String({ description: "Background task ID returned by bg_run." }),
});

const waitSchema = Type.Object({
  taskIds: Type.Optional(Type.Array(Type.String({ description: "Background task ID returned by bg_run." }), {
    description: "Tasks to wait for. Omit or pass an empty array to snapshot all tasks currently running.",
    uniqueItems: true,
  })),
  timeoutSeconds: Type.Optional(Type.Number({
    description: "Maximum time to wait in seconds. A wait timeout does not stop background tasks.",
    minimum: 0.001,
    maximum: MAX_TIMEOUT_SECONDS,
  })),
});

function sessionEnvironment(ctx: ExtensionContext): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.PI_SESSION_ID;
  delete env.PI_SESSION_FILE;
  delete env.PI_PROVIDER;
  delete env.PI_MODEL;
  delete env.PI_REASONING_LEVEL;

  env.PI_SESSION_ID = ctx.sessionManager.getSessionId();
  const sessionFile = ctx.sessionManager.getSessionFile();
  if (sessionFile) env.PI_SESSION_FILE = sessionFile;
  if (ctx.model) {
    env.PI_PROVIDER = ctx.model.provider;
    env.PI_MODEL = ctx.model.id;
  }
  if (ctx.thinkingLevel) env.PI_REASONING_LEVEL = ctx.thinkingLevel;
  return env;
}

function elapsed(task: TaskView): string {
  const start = task.startedAt ?? task.createdAt;
  const end = task.completedAt ?? Date.now();
  const seconds = Math.max(0, end - start) / 1_000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.floor(seconds % 60);
  return `${minutes}m${String(remainder).padStart(2, "0")}s`;
}

function taskSummary(task: TaskView): string {
  const exit = task.exitCode === undefined ? "" : ` exit=${task.exitCode ?? "none"}`;
  const error = task.error ? ` error=${JSON.stringify(task.error)}` : "";
  return `${task.id} ${task.status} ${elapsed(task)} ${JSON.stringify(task.name)}${exit}${error}`;
}

function taskList(tasks: readonly TaskView[]): string {
  if (tasks.length === 0) return "Background tasks: 0 tasks in this Pi session.";
  return [`Background tasks: ${tasks.length}`, ...tasks.map(taskSummary)].join("\n");
}

function compactTaskName(name: string): string {
  const compact = name.replace(/\s+/g, " ").trim();
  return compact.length <= 32 ? compact : `${compact.slice(0, 29)}...`;
}

function activeTaskLine(tasks: readonly TaskView[]): string | undefined {
  const active = tasks.filter((task) => task.status === "starting" || task.status === "running");
  if (active.length === 0) return undefined;

  const visible = active
    .slice(0, STATUS_TASK_LIMIT)
    .map((task) => `${task.id} ${JSON.stringify(compactTaskName(task.name))}`)
    .join(", ");
  const remaining = active.length - STATUS_TASK_LIMIT;
  const more = remaining > 0 ? `, +${remaining} more` : "";
  return `Background: ${active.length} running - ${visible}${more} - /ps for details`;
}

function outputText(task: TaskView, output: OutputSnapshot): string {
  const body = output.content || "(no output)";
  const notices: string[] = [];
  if (output.truncation.truncated) {
    notices.push(
      `Showing the last ${output.truncation.outputLines} of ${output.truncation.totalLines} lines ` +
      `(${formatSize(output.truncation.outputBytes)} of ${formatSize(output.truncation.totalBytes)}).`,
    );
  }
  if (output.fullOutputPath) notices.push(`Full output: ${output.fullOutputPath}`);
  if (output.fullOutputCapped) {
    notices.push(`The temporary full-output file reached its background-process size limit.`);
  }
  if (output.fullOutputError) notices.push(`Temporary output file error: ${output.fullOutputError}`);
  const suffix = notices.length > 0 ? `\n\n[${notices.join(" ")}]` : "";
  return `${taskSummary(task)}\n\n${body}${suffix}`;
}

function waitText(result: WaitResult): string {
  if (result.tasks.length === 0) return "No running background tasks were selected. Wait completed immediately.";
  const header = result.timedOut
    ? "Background wait timed out. Unfinished tasks continue running."
    : "Selected background tasks reached terminal state.";
  const summaries = result.tasks.map(taskSummary);
  if (result.tasks.length !== 1) {
    return [header, ...summaries, "Use bg_logs with a task ID to inspect captured output."].join("\n");
  }
  const task = result.tasks[0]!;
  const output = result.outputs[0]!.output;
  return `${header}\n\n${outputText(task, output)}`;
}

function textResult(text: string, details: unknown) {
  return { content: [{ type: "text" as const, text }], details };
}

export function registerBackgroundProcesses(pi: ExtensionAPI, operations: BashOperations): void {
  let ui: ExtensionContext["ui"] | undefined;
  let registry!: BackgroundTaskRegistry;
  const updateStatusWidget = () => {
    if (!ui) return;
    const line = activeTaskLine(registry.list());
    if (line) ui.setWidget(statusWidgetKey, [line], { placement: "aboveEditor" });
    else ui.setWidget(statusWidgetKey, undefined);
  };

  registry = new BackgroundTaskRegistry(
    operations,
    (task) => {
      pi.sendMessage(
        {
          customType: completionMessageType,
          content: [
            `Background task ${task.id} reached terminal state: ${task.status}.`,
            `Name: ${task.name}`,
            task.error ? `Result: ${task.error}` : undefined,
            `Use bg_logs with taskId ${task.id} to inspect its captured output.`,
          ].filter(Boolean).join("\n"),
          display: true,
          details: { taskId: task.id, name: task.name, status: task.status },
        },
        { deliverAs: "followUp", triggerTurn: true },
      );
    },
    updateStatusWidget,
  );

  pi.registerTool({
    name: "bg_run",
    label: "Background Run",
    description:
      `Start a documented long-running Bash command in the current working directory and return immediately. ` +
      `The task outlives the current turn but not the Pi session. At most ${MAX_ACTIVE_TASKS} tasks run concurrently, ` +
      `and the most recent ${MAX_RETAINED_TASKS} terminal tasks remain inspectable. Output follows Pi Bash limits of ` +
      `${DEFAULT_MAX_LINES} lines or ${formatSize(DEFAULT_MAX_BYTES)} and uses an ` +
      `OS temporary file when truncated.`,
    promptSnippet: "Start a documented long-running command without blocking the current turn",
    promptGuidelines: [
      "Give each task a short name that identifies its purpose; a long description is not required.",
      "Use bg_run instead of bash only when applicable command documentation identifies the command as long-running, or when the command must outlive the current turn.",
      "Use bash for ordinary commands, including slow commands that should finish in the current turn.",
      "After bg_run, continue useful independent work. Use bg_wait only when no useful independent work remains; do not sleep or poll bg_status or bg_logs.",
      "Background tasks started by bg_run outlive turns, not Pi sessions, and do not support interactive input.",
    ],
    parameters: runSchema,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      ui = ctx.ui;
      const task = registry.run({
        name: params.name,
        command: params.command,
        cwd: ctx.cwd,
        timeoutSeconds: params.timeoutSeconds,
        env: sessionEnvironment(ctx),
      });
      return textResult(
        `Started ${task.id} ${JSON.stringify(task.name)} with status ${task.status}. ` +
        "Continue independent work or use bg_wait when its result is the next dependency.",
        { task },
      );
    },
  });

  pi.registerTool({
    name: "bg_wait",
    label: "Background Wait",
    description:
      "Wait for all selected background tasks to finish. Omit taskIds or pass [] to select the tasks running when " +
      "bg_wait is called; tasks started later are excluded and notify separately. The wait claims selected completions, " +
      "so they do not also trigger an automatic completion turn. A wait timeout or cancellation does not stop the " +
      "tasks. A multi-task result gives summaries; use bg_logs for each task's captured output.",
    parameters: waitSchema,
    async execute(_toolCallId, params, signal) {
      const result = await registry.wait({
        taskIds: params.taskIds,
        timeoutSeconds: params.timeoutSeconds,
        signal,
      });
      return textResult(waitText(result), result);
    },
  });

  pi.registerTool({
    name: "bg_status",
    label: "Background Status",
    description: "Inspect one background task or list retained tasks without waiting. Do not poll this tool.",
    parameters: statusSchema,
    async execute(_toolCallId, params) {
      const tasks = params.taskId ? [registry.get(params.taskId)] : registry.list();
      return textResult(taskList(tasks), { tasks });
    },
  });

  pi.registerTool({
    name: "bg_logs",
    label: "Background Logs",
    description:
      `Read captured output for one background task. Output is limited to the last ${DEFAULT_MAX_LINES} lines ` +
      `or ${formatSize(DEFAULT_MAX_BYTES)}; truncated output includes an OS temporary-file path.`,
    parameters: taskIdSchema,
    async execute(_toolCallId, params) {
      const task = registry.get(params.taskId);
      const output = registry.logs(params.taskId);
      return textResult(outputText(task, output), { task, output });
    },
  });

  pi.registerTool({
    name: "bg_kill",
    label: "Background Kill",
    description: "Stop one running background task. This operation is idempotent for a task already in terminal state.",
    parameters: taskIdSchema,
    async execute(_toolCallId, params) {
      const task = await registry.kill(params.taskId);
      return textResult(taskSummary(task), { task });
    },
  });

  pi.registerCommand("ps", {
    description: "List background tasks in this Pi session.",
    handler: async (_args, ctx) => {
      ui = ctx.ui;
      updateStatusWidget();
      ctx.ui.notify(taskList(registry.list()), "info");
    },
  });

  pi.on("session_shutdown", async () => {
    await registry.shutdown();
  });
}

export default function backgroundProcesses(pi: ExtensionAPI): void {
  registerBackgroundProcesses(pi, createLocalBashOperations());
}
