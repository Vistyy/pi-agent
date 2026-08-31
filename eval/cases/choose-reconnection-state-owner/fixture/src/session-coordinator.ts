import { WorkspaceRuntime, type Workspace } from "./workspace-runtime.js";

export interface ReconnectionState {
  resumeToken?: string;
  lastAcknowledgedSequence: number;
}

export class SessionCoordinator {
  private readonly reconnectionState: ReconnectionState = {
    lastAcknowledgedSequence: 0,
  };

  private runtime: WorkspaceRuntime;

  constructor(workspace: Workspace) {
    this.runtime = new WorkspaceRuntime(workspace, this.reconnectionState);
  }

  replaceWorkspace(workspace: Workspace): void {
    this.runtime.dispose();
    this.runtime = new WorkspaceRuntime(workspace, this.reconnectionState);
  }

  reconnect(): string | undefined {
    return this.runtime.reconnect();
  }

  updateReconnectionState(resumeToken: string, sequence: number): void {
    this.reconnectionState.resumeToken = resumeToken;
    this.reconnectionState.lastAcknowledgedSequence = sequence;
  }
}
