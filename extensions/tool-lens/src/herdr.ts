import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { ToolLensSnapshot } from "./popup-protocol.js";

export const HERDR_PLUGIN_ID = "pi-tool-lens";
export const HERDR_ENTRYPOINT_ID = "lens";

interface CommandResult {
  stdout: string;
  stderr: string;
  code: number;
}

export type CommandRunner = (command: string, args: string[], options?: { cwd?: string }) => Promise<CommandResult>;

interface HerdrPluginRecord {
  plugin_id?: string;
  plugin_root?: string;
  enabled?: boolean;
}

function parsePluginList(stdout: string): HerdrPluginRecord[] {
  const parsed = JSON.parse(stdout) as { result?: { plugins?: HerdrPluginRecord[] } };
  return Array.isArray(parsed.result?.plugins) ? parsed.result.plugins : [];
}

function commandFailure(action: string, result: CommandResult): Error {
  const detail = result.stderr.trim() || result.stdout.trim() || `exit code ${result.code}`;
  return new Error(`${action}: ${detail}`);
}

async function runChecked(run: CommandRunner, args: string[], cwd: string, action: string): Promise<CommandResult> {
  const result = await run("herdr", args, { cwd });
  if (result.code !== 0) throw commandFailure(action, result);
  return result;
}

export async function ensureHerdrPlugin(run: CommandRunner, pluginRoot: string, cwd: string): Promise<void> {
  const listed = await runChecked(run, ["plugin", "list", "--plugin", HERDR_PLUGIN_ID, "--json"], cwd, "Cannot inspect the Tool Lens Herdr plugin");
  let plugins: HerdrPluginRecord[];
  try {
    plugins = parsePluginList(listed.stdout);
  } catch {
    throw new Error("Cannot inspect the Tool Lens Herdr plugin: Herdr returned invalid JSON.");
  }

  const current = plugins.find((plugin) => plugin.plugin_id === HERDR_PLUGIN_ID);
  const expectedRoot = resolve(pluginRoot);
  if (current && resolve(current.plugin_root ?? "") !== expectedRoot) {
    await runChecked(run, ["plugin", "unlink", HERDR_PLUGIN_ID], cwd, "Cannot replace the stale Tool Lens Herdr plugin link");
  }
  if (!current || resolve(current.plugin_root ?? "") !== expectedRoot) {
    await runChecked(run, ["plugin", "link", expectedRoot], cwd, "Cannot link the Tool Lens Herdr plugin");
  } else if (current.enabled === false) {
    await runChecked(run, ["plugin", "enable", HERDR_PLUGIN_ID], cwd, "Cannot enable the Tool Lens Herdr plugin");
  }
}

async function writeSnapshot(snapshot: ToolLensSnapshot): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "pi-tool-lens-"));
  const path = join(directory, "snapshot.json");
  await writeFile(path, JSON.stringify(snapshot), { encoding: "utf8", mode: 0o600 });
  return path;
}

export async function launchHerdrPopup(
  run: CommandRunner,
  pluginRoot: string,
  snapshot: ToolLensSnapshot,
): Promise<string> {
  await ensureHerdrPlugin(run, pluginRoot, snapshot.cwd);
  const snapshotPath = await writeSnapshot(snapshot);
  try {
    await runChecked(
      run,
      [
        "plugin",
        "pane",
        "open",
        "--plugin",
        HERDR_PLUGIN_ID,
        "--entrypoint",
        HERDR_ENTRYPOINT_ID,
        "--placement",
        "popup",
        "--width",
        "85%",
        "--height",
        "85%",
        "--cwd",
        snapshot.cwd,
        "--env",
        `TOOL_LENS_SNAPSHOT=${snapshotPath}`,
        "--focus",
      ],
      snapshot.cwd,
      "Cannot open the Tool Lens Herdr popup",
    );
    return snapshotPath;
  } catch (error) {
    await rm(snapshotPath, { force: true });
    await rm(dirname(snapshotPath), { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}

export function extensionCommandRunner(pi: ExtensionAPI): CommandRunner {
  return async (command, args, options) => {
    const result = await pi.exec(command, args, options);
    return { stdout: result.stdout, stderr: result.stderr, code: result.code };
  };
}
