import type { ReconnectionState } from "./session-coordinator.js";

export interface Workspace {
  id: string;
}

export class WorkspaceRuntime {
  constructor(
    readonly workspace: Workspace,
    private readonly reconnectionState: ReconnectionState,
  ) {}

  reconnect(): string | undefined {
    return this.reconnectionState.resumeToken;
  }

  dispose(): void {
    // Workspace-scoped resources are released when the active workspace changes.
  }
}
