import path from "node:path";
import {
  getAgentDir,
  loadProjectContextFiles,
  type ExtensionAPI,
  type ExtensionContext,
} from "@earendil-works/pi-coding-agent";

const CHILD_OWNER_TOKEN_ENV = "PI_SUBAGENT_OWNER_TOKEN";
const NAMED_AGENT_REQUIRED_REASON =
  "spawn_agent requires a named agent_type.";

function isAgentsFile(filePath: string) {
  return path.basename(filePath).toUpperCase() === "AGENTS.MD";
}

function escapeAttribute(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;");
}

function isCodexSubagent() {
  return Boolean(process.env[CHILD_OWNER_TOKEN_ENV]);
}

function applyNonInteractiveChildUi(context: ExtensionContext) {
  if (context.mode !== "rpc" || !isCodexSubagent()) return;

  context.ui.select = async () => undefined;
  context.ui.confirm = async () => false;
  context.ui.input = async () => undefined;
  context.ui.editor = async () => undefined;
}

export default function namedSubagentPolicy(pi: ExtensionAPI) {
  pi.on("session_start", (_event, context) => {
    applyNonInteractiveChildUi(context);
  });

  pi.on("tool_call", (event, context) => {
    applyNonInteractiveChildUi(context);
    if (event.toolName !== "spawn_agent") return;

    const agentType = event.input.agent_type;
    if (typeof agentType !== "string" || agentType.trim() === "") {
      return {
        block: true,
        reason: NAMED_AGENT_REQUIRED_REASON,
      };
    }
  });

  pi.on("before_agent_start", (event, context) => {
    const additions: string[] = [];
    const existingPaths = new Set(
      (event.systemPromptOptions.contextFiles ?? []).map((file) =>
        path.resolve(file.path),
      ),
    );
    const agentsFiles = loadProjectContextFiles({
      cwd: context.cwd,
      agentDir: getAgentDir(),
    }).filter(
      (file) =>
        isAgentsFile(file.path) && !existingPaths.has(path.resolve(file.path)),
    );

    additions.push(
      ...agentsFiles.map(
        (file) =>
          `<project-guidance source="${escapeAttribute(file.path)}">\n\n${file.content.trimEnd()}\n\n</project-guidance>`,
      ),
    );

    if (additions.length === 0) return;
    return {
      systemPrompt: `${event.systemPrompt}\n\n${additions.join("\n\n")}`,
    };
  });
}
