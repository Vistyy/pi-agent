export type ToolName = "read" | "write" | "edit" | "bash" | "grep" | "find" | "ls";

export const TOOL_NAMES: readonly ToolName[] = ["read", "write", "edit", "bash", "grep", "find", "ls"];

export interface ToolCardRenderState {
  startedAt?: number;
  finishedAt?: number;
}
