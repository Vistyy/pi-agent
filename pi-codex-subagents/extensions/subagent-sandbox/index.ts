import { homedir } from "node:os";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { buildSandboxedCommand } from "./src/sandbox.js";
import { isScratchMutationPath } from "./src/scratch-path.js";
import {
  createScratchRun,
  DEFAULT_SCRATCH_ROOT,
  type ScratchRun,
} from "./src/scratch.js";

export interface SubagentSandboxOptions {
  homeDir?: string;
  scratchRoot?: string;
  persistentWritableDirectories?: string[];
  xdgCacheHome?: string;
}

function sandboxContract(
  scratchDir: string,
  persistentWritableDirectories: string[],
) {
  return `## Disposable worker filesystem

Use \`${scratchDir}\`, exposed in Bash as \`$TMPDIR\`, for prototypes and files shared across tool calls.
The edit and write tools accept only absolute paths inside this scratch directory.
Bash changes outside scratch are discarded after each Bash call.
A continued worker receives a new empty scratch directory.
${
  persistentWritableDirectories.length > 0
    ? `The following directory is persistent host storage: \`${persistentWritableDirectories.join("`, `")}\`.`
    : ""
}`.trimEnd();
}

export function registerSubagentSandbox(
  pi: ExtensionAPI,
  options: SubagentSandboxOptions = {},
) {
  const homeDir = options.homeDir ?? process.env.HOME ?? homedir();
  const scratchRoot = options.scratchRoot ?? DEFAULT_SCRATCH_ROOT;
  const persistentWritableDirectories =
    options.persistentWritableDirectories ?? [];
  const xdgCacheHome = options.xdgCacheHome;
  let scratchRun: ScratchRun | undefined;

  const ensureScratchRun = () => {
    scratchRun ??= createScratchRun(scratchRoot);
    return scratchRun;
  };
  const cleanup = () => {
    scratchRun?.cleanup();
    scratchRun = undefined;
    process.removeListener("exit", cleanup);
  };
  process.once("exit", cleanup);

  pi.on("session_start", () => {
    ensureScratchRun();
  });

  pi.on("before_agent_start", (event) => {
    const { scratchDir } = ensureScratchRun();
    return {
      systemPrompt: `${event.systemPrompt}\n\n${sandboxContract(
        scratchDir,
        persistentWritableDirectories,
      )}`,
    };
  });

  pi.on("tool_call", (event) => {
    if (event.toolName === "edit" || event.toolName === "write") {
      const { scratchDir } = ensureScratchRun();
      const requestedPath =
        typeof event.input.path === "string" ? event.input.path : "";
      if (!isScratchMutationPath(requestedPath, scratchDir)) {
        return {
          block: true,
          reason: `Subagent sandbox: ${event.toolName} accepts only absolute paths inside ${scratchDir}.`,
        };
      }
      return;
    }

    if (event.toolName === "bash") {
      const command =
        typeof event.input.command === "string" ? event.input.command : "";
      const { scratchDir } = ensureScratchRun();
      event.input.command = buildSandboxedCommand(command, {
        bashNetwork: true,
        homeDir,
        persistentWritableDirectories,
        scratchDir,
        xdgCacheHome,
      });
    }
  });

  pi.on("session_shutdown", () => {
    cleanup();
  });
}

export default function subagentSandbox(pi: ExtensionAPI) {
  registerSubagentSandbox(pi);
}
