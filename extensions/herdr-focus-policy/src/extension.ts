import { isToolCallEventType, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { hasHerdrFocusChange, HERDR_FOCUS_BLOCK_MESSAGE } from "./policy.js";

export function registerHerdrFocusPolicy(pi: ExtensionAPI) {
  pi.on("tool_call", (event) => {
    if (!isToolCallEventType("bash", event)) return;
    if (!hasHerdrFocusChange(event.input.command)) return;

    return { block: true, reason: HERDR_FOCUS_BLOCK_MESSAGE };
  });
}
