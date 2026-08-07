import { Type } from "typebox";

const MAX_TIMEOUT_SECONDS = 2_147_483_647 / 1_000;

export const runSchema = Type.Object({
  name: Type.String({
    description: "Short human-readable task label shown in the status line, /ps, and completion message. This is not a long description.",
    minLength: 1,
    maxLength: 80,
  }),
  command: Type.String({ description: "Long-running Bash command to execute.", minLength: 1 }),
  timeoutSeconds: Type.Optional(Type.Number({
    description: "Maximum execution time in seconds. If exceeded, the task is terminated with status timed_out. Omit for no limit.",
    minimum: 0.001,
    maximum: MAX_TIMEOUT_SECONDS,
  })),
});

export const statusSchema = Type.Object({
  taskId: Type.Optional(Type.String({ description: "Task ID. Omit to list all retained tasks." })),
});

export const taskIdSchema = Type.Object({
  taskId: Type.String({ description: "Background task ID returned by bg_run." }),
});

export const waitSchema = Type.Object({
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
