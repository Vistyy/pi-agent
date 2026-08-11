import { formatSize } from "@earendil-works/pi-coding-agent";
import type { OutputSnapshot } from "./output.js";
import type { TaskView, WaitResult } from "./registry.js";

const STATUS_TASK_LIMIT = 3;

function elapsed(task: TaskView): string {
  const start = task.startedAt ?? task.createdAt;
  const end = task.completedAt ?? Date.now();
  const seconds = Math.max(0, end - start) / 1_000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.floor(seconds % 60);
  return `${minutes}m${String(remainder).padStart(2, "0")}s`;
}

export function taskSummary(task: TaskView): string {
  const exit = task.exitCode === undefined ? "" : ` exit=${task.exitCode ?? "none"}`;
  const error = task.error ? ` error=${JSON.stringify(task.error)}` : "";
  return `${task.id} ${task.status} ${elapsed(task)} ${JSON.stringify(task.name)}${exit}${error}`;
}

export function taskList(tasks: readonly TaskView[]): string {
  if (tasks.length === 0) return "Background tasks: 0 tasks in this Pi session.";
  return [`Background tasks: ${tasks.length}`, ...tasks.map(taskSummary)].join("\n");
}

function compactTaskName(name: string): string {
  const compact = name.replace(/\s+/g, " ").trim();
  return compact.length <= 32 ? compact : `${compact.slice(0, 29)}...`;
}

export function activeTaskLine(tasks: readonly TaskView[]): string | undefined {
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

export function outputText(task: TaskView, output: OutputSnapshot): string {
  const body = output.content || "(no output)";
  const notices: string[] = [];
  if (output.truncation.truncated) {
    notices.push(
      `Showing the last ${output.truncation.outputLines} of ${output.truncation.totalLines} lines ` +
      `(${formatSize(output.truncation.outputBytes)} of ${formatSize(output.truncation.totalBytes)}).`,
    );
  }
  if (output.fullOutputPath) notices.push(`Captured output: ${output.fullOutputPath}`);
  if (output.fullOutputCapped) {
    notices.push("The temporary captured-output file reached its background-process size limit.");
  }
  if (output.fullOutputError) notices.push(`Temporary output file error: ${output.fullOutputError}`);
  const suffix = notices.length > 0 ? `\n\n[${notices.join(" ")}]` : "";
  return `${taskSummary(task)}\n\n${body}${suffix}`;
}

export function waitText(result: WaitResult): string {
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
