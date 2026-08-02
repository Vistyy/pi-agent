import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { Key, matchesKey, ProcessTerminal } from "@earendil-works/pi-tui";
import { resultBodyLines } from "./format.js";
import { deserializeTheme, type ToolLensSnapshot } from "./popup-protocol.js";
import { ToolLensComponent } from "./ui.js";

export async function readToolLensSnapshot(path: string): Promise<ToolLensSnapshot> {
  const parsed = JSON.parse(await readFile(path, "utf8")) as ToolLensSnapshot;
  if (!parsed || typeof parsed.cwd !== "string" || !Array.isArray(parsed.results) || !parsed.theme) {
    throw new Error("Tool Lens snapshot is invalid.");
  }
  return parsed;
}

export async function runToolLensPopup(snapshotPath = process.env.TOOL_LENS_SNAPSHOT): Promise<void> {
  if (!snapshotPath) throw new Error("TOOL_LENS_SNAPSHOT is not set.");
  const snapshot = await readToolLensSnapshot(snapshotPath);
  const theme = deserializeTheme(snapshot.theme);
  const terminal = new ProcessTerminal();
  let stopped = false;
  let renderRequested = false;
  let lens: ToolLensComponent;

  const stop = () => {
    if (stopped) return;
    stopped = true;
    terminal.showCursor();
    terminal.stop();
  };
  const renderFrame = () => {
    const width = Math.max(1, terminal.columns - 4);
    const maxLines = Math.max(1, terminal.rows - 2);
    const lines = lens.render(width).slice(0, maxLines);
    const output = ["\u001b[2J\u001b[H", ...lines.map((line, row) => `\u001b[${row + 1};1H${line}`)].join("");
    terminal.write(output);
  };
  const requestRender = () => {
    if (stopped || renderRequested) return;
    renderRequested = true;
    process.nextTick(() => {
      renderRequested = false;
      if (!stopped) renderFrame();
    });
  };
  lens = new ToolLensComponent(
    snapshot.results,
    theme,
    stop,
    requestRender,
    (result, width) => resultBodyLines(result, width),
    () => Math.max(4, terminal.rows - 7),
  );

  terminal.start(
    (data) => {
      if (matchesKey(data, Key.ctrl("c"))) stop();
      else lens.handleInput(data);
    },
    requestRender,
  );
  terminal.hideCursor();
  process.once("SIGTERM", stop);
  process.once("SIGHUP", stop);
  requestRender();

  void Promise.all([
    import("@earendil-works/pi-coding-agent"),
    import("./native-renderer.js"),
  ]).then(([{ initTheme }, { createNativePreviewRenderer }]) => {
    if (stopped) return;
    initTheme(snapshot.theme.name, false);
    lens.setPreviewRenderer(createNativePreviewRenderer(snapshot.cwd, theme));
    requestRender();
  }).catch(() => {
    // Complete stored output remains available when native renderer loading fails.
  });
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : undefined;
if (invokedPath === import.meta.url) {
  runToolLensPopup().catch((error: unknown) => {
    process.stderr.write(`Tool Lens failed: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
