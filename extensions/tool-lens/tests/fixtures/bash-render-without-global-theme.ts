import { createNativePreviewRenderer } from "../../src/native-renderer.js";
import { deserializeTheme } from "../../src/popup-protocol.js";

const foreground = new Proxy({}, { get: () => "\u001b[37m" });
const background = new Proxy({}, { get: () => "\u001b[40m" });
const theme = deserializeTheme({ foreground, background } as any);
const render = createNativePreviewRenderer("/tmp", theme);
const lines = render({
  toolCallId: "bash-without-global-theme",
  toolName: "bash",
  invocation: "printf output",
  args: { command: "printf output" },
  content: [{ type: "text", text: "fallback output" }],
  details: undefined,
  isError: false,
  resultSummary: "1 line",
  tokenUsage: { input: 1, output: 1, total: 2 },
}, 80);
process.stdout.write(lines.join("\n"));
