import { isToolCallEventType, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { findPolicyViolation } from "./policy.js";

export function registerPackageManagerPolicy(pi: ExtensionAPI) {
  pi.on("tool_call", (event) => {
    if (!isToolCallEventType("bash", event)) return;

    const violation = findPolicyViolation(event.input.command);
    if (violation) {
      return { block: true, reason: violation.message };
    }
  });

  pi.on("user_bash", (event) => {
    const violation = findPolicyViolation(event.command);
    if (!violation) return;

    return {
      result: {
        output: violation.message,
        exitCode: 1,
        cancelled: false,
        truncated: false,
      },
    };
  });
}
