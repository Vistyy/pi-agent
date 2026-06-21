import { isToolCallEventType, type ExtensionAPI } from "@earendil-works/pi-coding-agent";

const blockedPackageManagers = /(^|[;&|()\n]\s*)(npm|npx)(\s|$)/;

const policyMessage =
  "Blocked npm/npx usage. Use pnpm instead. For npx, use pnpm dlx <package> or pnpm exec <command>.";

const promptPolicy = [
  "Package manager policy:",
  "- Use pnpm instead of npm.",
  "- Do not use npm or npx.",
  "- For npx, use pnpm dlx <package> or pnpm exec <command>.",
].join("\n");

export default function (pi: ExtensionAPI) {
  pi.on("before_agent_start", (event) => {
    return {
      systemPrompt: `${event.systemPrompt}\n\n${promptPolicy}`,
    };
  });

  pi.on("tool_call", (event) => {
    if (!isToolCallEventType("bash", event)) return;

    if (blockedPackageManagers.test(event.input.command)) {
      return { block: true, reason: policyMessage };
    }
  });

  pi.on("user_bash", (event) => {
    if (!blockedPackageManagers.test(event.command)) return;

    return {
      result: {
        output: policyMessage,
        exitCode: 1,
        cancelled: false,
        truncated: false,
      },
    };
  });
}
