import {
  createLocalBashOperations,
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  formatSize,
  type BashOperations,
  type ExtensionAPI,
  type ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import {
  BackgroundTaskRegistry,
  MAX_ACTIVE_TASKS,
  MAX_RETAINED_TASKS,
  type TaskView,
} from "./registry.js";
import { DeferredNotifications } from "./notifications.js";
import {
  activeTaskLine,
  outputText,
  taskList,
  taskSummary,
  waitText,
} from "./presentation.js";
import {
  runSchema,
  statusSchema,
  taskIdSchema,
  waitSchema,
} from "./tool-parameters.js";

const completionMessageType = "pi-background-process-completion";
const statusWidgetKey = "pi-background-processes";

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

function textResult(text: string, details: unknown) {
  return { content: [{ type: "text" as const, text }], details };
}

export function registerBackgroundProcesses(pi: ExtensionAPI, operations: BashOperations): void {
  let context: ExtensionContext | undefined;
  let ui: ExtensionContext["ui"] | undefined;
  let registry!: BackgroundTaskRegistry;
  const updateStatusWidget = () => {
    if (!ui) return;
    const line = activeTaskLine(registry.list());
    if (line) ui.setWidget(statusWidgetKey, [line], { placement: "aboveEditor" });
    else ui.setWidget(statusWidgetKey, undefined);
  };

  const deliverCompletion = (task: TaskView) => {
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
  };
  const notifications = new DeferredNotifications<TaskView>(
    () => context?.isIdle() ?? true,
    deliverCompletion,
  );
  registry = new BackgroundTaskRegistry(
    operations,
    (task) => notifications.complete(task.id, task),
    updateStatusWidget,
    (task) => notifications.claim(task.id),
    (task) => notifications.complete(task.id, task),
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
      context = ctx;
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
    async execute(_toolCallId, params, signal) {
      const task = await registry.kill(params.taskId, signal);
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

  pi.on("agent_settled", () => notifications.flush());

  pi.on("session_shutdown", async () => {
    notifications.clear();
    await registry.shutdown();
  });
}

export default function backgroundProcesses(pi: ExtensionAPI): void {
  registerBackgroundProcesses(pi, createLocalBashOperations());
}
