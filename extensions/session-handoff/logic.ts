import { randomUUID } from "node:crypto";

export interface CommandResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly killed?: boolean;
}

export interface SessionIdentity {
  readonly sessionId: string;
  readonly sessionFile: string;
}

export interface WorkspaceIdentity {
  readonly workspaceId: string;
  readonly tabId: string;
  readonly paneId: string;
}

export interface StartedAgentIdentity extends WorkspaceIdentity {
  readonly agentName: string;
  readonly reportedSessionFile?: string;
}

export interface StartedSessionIdentity extends SessionIdentity, WorkspaceIdentity {
  readonly agentName: string;
  readonly cwd: string;
}

export class HandoffError extends Error {
  readonly progress: Partial<StartedSessionIdentity>;

  constructor(
    message: string,
    progress: Partial<StartedSessionIdentity>,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.progress = progress;
  }
}

export function makeAgentName(): string {
  return `handoff-${randomUUID().slice(0, 8)}`;
}

export function makePromptArgument(prompt: string): string {
  return prompt.startsWith("-") ? ` ${prompt}` : prompt;
}

export function decodeWorkspace(result: CommandResult): WorkspaceIdentity {
  const value = decodeResult(result, "herdr workspace create");
  const workspace = field(value, "workspace");
  const tab = field(value, "tab");
  const pane = field(value, "root_pane");
  return {
    workspaceId: stringField(workspace, "workspace_id", "workspace"),
    tabId: stringField(tab, "tab_id", "tab"),
    paneId: stringField(pane, "pane_id", "root pane"),
  };
}

export function decodeStartedAgent(
  result: CommandResult,
  expected: WorkspaceIdentity & { readonly agentName: string },
): StartedAgentIdentity {
  const value = decodeResult(result, "herdr agent start");
  const agent = optionalField(value, "agent") ?? value;
  const workspaceId = stringField(agent, "workspace_id", "agent");
  const tabId = stringField(agent, "tab_id", "agent");
  const paneId = stringField(agent, "pane_id", "agent");
  const name = optionalStringField(agent, "name");
  if (
    workspaceId !== expected.workspaceId ||
    tabId !== expected.tabId ||
    paneId !== expected.paneId ||
    (name !== undefined && name !== expected.agentName)
  ) {
    throw new Error("Herdr started Pi at an unexpected workspace, tab, pane, or agent name.");
  }
  const session = optionalField(agent, "agent_session");
  const sessionFile = session ? optionalStringField(session, "value") : undefined;
  return {
    ...expected,
    reportedSessionFile: sessionFile,
  };
}

export function assertCommandSucceeded(result: CommandResult, operation: string): void {
  decodeResult(result, operation);
}

function decodeResult(result: CommandResult, operation: string): Record<string, unknown> {
  let envelope: unknown;
  try {
    envelope = JSON.parse(result.stdout || result.stderr);
  } catch (cause) {
    throw new Error(`${operation} returned invalid JSON.`, { cause });
  }
  if (!isRecord(envelope)) throw new Error(`${operation} returned a non-object response.`);
  const error = optionalField(envelope, "error");
  if (result.code !== 0 || error) {
    const message = error ? optionalStringField(error, "message") : undefined;
    throw new Error(message ? `${operation} failed: ${message}` : `${operation} failed with exit code ${result.code}.`);
  }
  return field(envelope, "result");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function field(value: Record<string, unknown>, name: string): Record<string, unknown> {
  const selected = optionalField(value, name);
  if (!selected) throw new Error(`Herdr response omitted ${name}.`);
  return selected;
}

function optionalField(value: Record<string, unknown>, name: string): Record<string, unknown> | undefined {
  const selected = value[name];
  return isRecord(selected) ? selected : undefined;
}

function stringField(value: Record<string, unknown>, name: string, owner: string): string {
  const selected = optionalStringField(value, name);
  if (!selected) throw new Error(`Herdr ${owner} omitted ${name}.`);
  return selected;
}

function optionalStringField(value: Record<string, unknown>, name: string): string | undefined {
  const selected = value[name];
  return typeof selected === "string" && selected.length > 0 ? selected : undefined;
}
