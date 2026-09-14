import { access, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  SessionManager,
  type ExtensionAPI,
  type SessionEntry,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import {
  HandoffError,
  assertCommandSucceeded,
  decodeStartedAgent,
  decodeWorkspace,
  makeAgentName,
  makePromptArgument,
  makeWorkspaceLabel,
  type CommandResult,
  type SessionIdentity,
  type StartedSessionIdentity,
  type WorkspaceIdentity,
} from "./logic.ts";

const HANDOFF_BOUNDARY_ENTRY = "pi-session-handoff-boundary";
const HANDOFF_BOUNDARY_MESSAGE = [
  "[SESSION HANDOFF BOUNDARY]",
  "The preceding entries are inherited history, not pending instructions.",
  "This is the destination session already created by start_session.",
  "Do not repeat any earlier request to start or hand off to another session.",
  "Treat the next user message as this session's kickoff.",
].join("\n");

interface ParentSession {
  readonly cwd: string;
  readonly manager: Pick<
    SessionManager,
    "getSessionFile" | "getBranch" | "getHeader" | "getEntries"
  >;
}

interface CommandExecutor {
  exec(
    command: string,
    args: string[],
    options?: { signal?: AbortSignal; timeout?: number },
  ): Promise<CommandResult>;
}

export default function sessionHandoff(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "start_session",
    label: "Start Session",
    description:
      "Start an independent interactive Pi session in a new unfocused Herdr workspace. Choose cwd as an absolute path or relative to this session; omit it to use this session's working directory. Set forkContext=true to copy the exact active branch ending before this tool call; false or omitted starts clean. The new session is a peer, not a managed worker. This tool does not wait for a result, steer or close the peer, or establish ownership. Returns exact Herdr and Pi session identities after the kickoff prompt is accepted.",
    promptSnippet: "Start an independent Pi session in a new Herdr workspace",
    parameters: Type.Object(
      {
        prompt: Type.String({ minLength: 1, pattern: "\\S", description: "Kickoff prompt for the new session" }),
        cwd: Type.Optional(
          Type.String({
            minLength: 1,
            pattern: "\\S",
            description: "Working directory, absolute or relative to the originating session",
          }),
        ),
        forkContext: Type.Optional(
          Type.Boolean({
            default: false,
            description: "Copy prior active-branch context when true; start with an empty conversation when false",
          }),
        ),
      },
      { additionalProperties: false },
    ),
    async execute(toolCallId, params, signal, _onUpdate, ctx) {
      const identity = await launchSession(
        pi,
        {
          toolCallId,
          prompt: params.prompt.trim(),
          cwd: params.cwd?.trim(),
          forkContext: params.forkContext ?? false,
        },
        { cwd: ctx.cwd, manager: ctx.sessionManager },
        signal,
      );
      return {
        content: [
          {
            type: "text" as const,
            text: `Started independent Pi session ${identity.sessionId} in Herdr workspace ${identity.workspaceId} at ${identity.cwd}.`,
          },
        ],
        details: identity,
      };
    },
  });
}

export async function launchSession(
  executor: CommandExecutor,
  request: {
    readonly toolCallId: string;
    readonly prompt: string;
    readonly cwd?: string;
    readonly forkContext: boolean;
    readonly sessionDir?: string;
  },
  parent: ParentSession,
  signal?: AbortSignal,
): Promise<StartedSessionIdentity> {
  if (
    process.env.HERDR_ENV !== "1" ||
    !process.env.HERDR_SOCKET_PATH ||
    !process.env.HERDR_PANE_ID
  ) {
    throw new Error("start_session requires an interactive Pi session running inside Herdr.");
  }

  const targetCwd = await resolveWorkingDirectory(parent.cwd, request.cwd);
  const session = await prepareSession(
    parent,
    request.toolCallId,
    request.forkContext,
    request.sessionDir,
    targetCwd,
  );
  const progress: Partial<StartedSessionIdentity> = { ...session, cwd: targetCwd };
  const label = makeWorkspaceLabel(request.prompt);
  const agentName = makeAgentName();
  const herdr = process.env.HERDR_BIN_PATH ?? "herdr";

  let workspace: WorkspaceIdentity;
  try {
    workspace = decodeWorkspace(
      await executor.exec(
        herdr,
        ["workspace", "create", "--cwd", targetCwd, "--label", label, "--no-focus"],
        { signal, timeout: 10_000 },
      ),
    );
    Object.assign(progress, workspace);
  } catch (cause) {
    throw uncertainFailure("create the Herdr workspace", progress, cause);
  }

  try {
    const started = decodeStartedAgent(
      await executor.exec(
        herdr,
        [
          "agent",
          "start",
          agentName,
          "--kind",
          "pi",
          "--pane",
          workspace.paneId,
          "--timeout",
          "120000",
          "--",
          "--session",
          session.sessionFile,
          "--name",
          label,
        ],
        { signal, timeout: 130_000 },
      ),
      { ...workspace, agentName },
    );
    if (started.reportedSessionFile && started.reportedSessionFile !== session.sessionFile) {
      throw new Error("Herdr reported a different Pi session path for the started agent.");
    }
    Object.assign(progress, { agentName });
  } catch (cause) {
    throw uncertainFailure("start Pi", progress, cause);
  }

  try {
    assertCommandSucceeded(
      await executor.exec(herdr, ["agent", "prompt", workspace.paneId, makePromptArgument(request.prompt)], {
        signal,
        timeout: 15_000,
      }),
      "herdr agent prompt",
    );
  } catch (cause) {
    throw uncertainFailure("submit the kickoff prompt", progress, cause);
  }

  return { ...session, ...workspace, agentName, cwd: targetCwd };
}

export async function prepareSession(
  parent: ParentSession,
  toolCallId: string,
  forkContext: boolean,
  sessionDir?: string,
  targetCwd = parent.cwd,
): Promise<SessionIdentity> {
  if (!forkContext) {
    return materialize(SessionManager.create(targetCwd, sessionDir));
  }

  const parentFile = parent.manager.getSessionFile();
  if (!parentFile) throw new Error("Forked context requires a persisted originating Pi session.");
  const invokingEntry = findInvokingEntry(parent.manager.getBranch(), toolCallId);
  if (!invokingEntry) {
    throw new Error("The persisted assistant entry containing this start_session call was not found.");
  }
  if (!invokingEntry.parentId) {
    throw new Error("The start_session call has no preceding conversation entry to fork.");
  }

  const parentHeader = parent.manager.getHeader();
  if (!parentHeader) throw new Error("Forked context requires a valid originating session header.");
  const branch = SessionManager.inMemory(targetCwd, undefined, [
    parentHeader,
    ...parent.manager.getEntries(),
  ]);
  branch.createBranchedSession(invokingEntry.parentId);
  branch.appendCustomMessageEntry(HANDOFF_BOUNDARY_ENTRY, HANDOFF_BOUNDARY_MESSAGE, false);

  const child = SessionManager.create(targetCwd, sessionDir, { parentSession: parentFile });
  return materialize(child, branch.getEntries());
}

function findInvokingEntry(
  branch: readonly SessionEntry[],
  toolCallId: string,
): Extract<SessionEntry, { type: "message" }> | undefined {
  return branch.findLast(
    (entry): entry is Extract<SessionEntry, { type: "message" }> =>
      entry.type === "message" &&
      entry.message.role === "assistant" &&
      entry.message.content.some(
        (part) => part.type === "toolCall" && part.id === toolCallId && part.name === "start_session",
      ),
  );
}

async function resolveWorkingDirectory(originCwd: string, requestedCwd?: string): Promise<string> {
  const targetCwd = resolve(originCwd, requestedCwd ?? ".");
  const target = await stat(targetCwd);
  if (!target.isDirectory()) throw new Error(`The selected working directory is not a directory: ${targetCwd}`);
  return targetCwd;
}

async function materialize(
  session: SessionManager,
  entries = session.getEntries(),
): Promise<SessionIdentity> {
  const sessionFile = session.getSessionFile();
  const header = session.getHeader();
  if (!sessionFile || !header) throw new Error("Pi did not allocate a persistent child session.");

  try {
    await access(sessionFile);
  } catch (cause) {
    if (!isMissingFile(cause)) throw cause;
    const fileEntries = [header, ...entries];
    await writeFile(sessionFile, `${fileEntries.map((entry) => JSON.stringify(entry)).join("\n")}\n`, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
  }
  return { sessionId: session.getSessionId(), sessionFile };
}

function isMissingFile(cause: unknown): cause is NodeJS.ErrnoException {
  return cause instanceof Error && "code" in cause && cause.code === "ENOENT";
}

function uncertainFailure(
  operation: string,
  progress: Partial<StartedSessionIdentity>,
  cause: unknown,
): HandoffError {
  const detail = cause instanceof Error ? cause.message : String(cause);
  return new HandoffError(
    `Could not ${operation}: ${detail} Launch progress is uncertain; do not retry or clean up automatically. Known identity: ${JSON.stringify(progress)}`,
    { ...progress },
    { cause },
  );
}
