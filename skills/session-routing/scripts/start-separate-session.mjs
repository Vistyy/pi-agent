#!/usr/bin/env node

import { accessSync, constants, readFileSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const usage = "start-separate-session --name <name> --cwd <path> --handoff-file <path> [--focus] [--timeout-ms <milliseconds>]";

function quoted(value) {
  return JSON.stringify(String(value));
}

function homePath(value) {
  const home = os.homedir();
  return value === home ? "~" : value.startsWith(`${home}${path.sep}`) ? `~${value.slice(home.length)}` : value;
}

function homeView() {
  process.stdout.write(`bin: ${quoted(homePath(scriptPath))}\ndescription: ${quoted("Start and verify a default Pi session in a new named Herdr workspace")}\nusage: ${quoted(usage)}\n`);
}

function help() {
  process.stdout.write(`${usage}\n\nRequired:\n  --name <name>           Descriptive Herdr workspace and Pi session name\n  --cwd <path>            Working directory for the new session\n  --handoff-file <path>   Compact handoff used as the initial Pi prompt\n\nOptional:\n  --focus                 Focus the new session after launch\n  --timeout-ms <number>   Shell readiness and Pi verification timeout in milliseconds (default: 10000)\n  --help                  Show this help\n\nEnvironment:\n  HERDR_BIN               Override the Herdr executable\n\nExamples:\n  start-separate-session --name audit-agent-instructions --cwd ~/.pi/agent --handoff-file /tmp/handoff.md\n  start-separate-session --name continue-token-audit --cwd ~/.pi/agent --handoff-file /tmp/handoff.md --focus\n`);
}

function fail(message, suggestion, code = 1) {
  process.stdout.write(`error: ${message}\n`);
  if (suggestion) process.stdout.write(`help: ${suggestion}\n`);
  process.exit(code);
}

function parseArgs(argv) {
  const result = { focus: false, timeoutMs: 10_000 };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--focus") {
      result.focus = true;
      continue;
    }
    if (arg === "--help") {
      result.help = true;
      continue;
    }
    const key = {
      "--name": "name",
      "--cwd": "cwd",
      "--handoff-file": "handoffFile",
      "--timeout-ms": "timeoutMs",
    }[arg];
    if (!key) fail(`unknown option ${arg}`, usage, 2);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) fail(`${arg} requires a value`, usage, 2);
    result[key] = key === "timeoutMs" ? Number(value) : value;
    index += 1;
  }
  return result;
}

function findExecutable(name, override) {
  if (override) {
    const absolute = path.resolve(override);
    try {
      accessSync(absolute, constants.X_OK);
      return absolute;
    } catch {
      fail(`${name} executable is unavailable at ${quoted(absolute)}`, `Set ${name.toUpperCase()}_BIN to an executable path`);
    }
  }
  for (const directory of (process.env.PATH ?? "").split(path.delimiter)) {
    if (!directory) continue;
    const candidate = path.resolve(directory, name);
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Continue searching PATH.
    }
  }
  fail(`${name} executable is unavailable`, `Install ${name} or set ${name.toUpperCase()}_BIN`);
}

function run(executable, args) {
  return spawnSync(executable, args, { encoding: "utf8", maxBuffer: 1024 * 1024 });
}

function parseJsonOutput(result, operation, cleanup) {
  if (result.error) {
    cleanup?.();
    fail(`${operation} could not execute`, "Check the configured executable and retry");
  }
  let parsed;
  try {
    parsed = JSON.parse(result.stdout.trim() || result.stderr.trim());
  } catch {
    cleanup?.();
    fail(`${operation} returned an unreadable result`, "Run `herdr status server` and retry");
  }
  if (result.status !== 0 || parsed.error) {
    cleanup?.();
    const detail = parsed?.error?.message;
    fail(detail ? `${operation} failed: ${detail}` : `${operation} failed`, "Inspect `herdr agent list` and retry");
  }
  return parsed;
}

function requireSuccess(result, operation, cleanup) {
  if (!result.error && result.status === 0) return;
  cleanup?.();
  let detail;
  try {
    detail = JSON.parse(result.stdout.trim() || result.stderr.trim())?.error?.message;
  } catch {
    // Use the generic failure below.
  }
  fail(detail ? `${operation} failed: ${detail}` : `${operation} failed`, "Inspect `herdr agent list` and retry");
}

function startAgentWhenShellReady({ herdr, name, paneId, deadline, cleanup }) {
  const args = ["agent", "start", name, "--kind", "pi", "--pane", paneId, "--", "--name", name];
  while (true) {
    const result = run(herdr, args);
    if (result.error) {
      cleanup?.();
      fail("session launch could not execute", "Check the configured executable and retry");
    }
    let parsed;
    try {
      parsed = JSON.parse(result.stdout.trim() || result.stderr.trim());
    } catch {
      cleanup?.();
      fail("session launch returned an unreadable result", "Run `herdr status server` and retry");
    }
    if (result.status === 0 && !parsed.error) return parsed;

    const detail = parsed?.error?.message;
    if (typeof detail === "string" && /not an available shell/i.test(detail) && Date.now() < deadline) {
      sleep(Math.min(100, Math.max(1, deadline - Date.now())));
      continue;
    }
    cleanup?.();
    fail(
      detail ? `session launch failed: ${detail}` : "session launch failed",
      "Inspect `herdr agent list` and retry",
    );
  }
}

function sleep(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

const argv = process.argv.slice(2);
if (argv.length === 0) {
  homeView();
  process.exit(0);
}

const options = parseArgs(argv);
if (options.help) {
  help();
  process.exit(0);
}
if (!options.name) fail("--name is required", usage, 2);
if (!options.cwd) fail("--cwd is required", usage, 2);
if (!options.handoffFile) fail("--handoff-file is required", usage, 2);
if (options.name.length > 32 || !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)+$/.test(options.name)) {
  fail(
    "--name must be a descriptive kebab-case name of at most 32 characters",
    "Use a name such as audit-agent-instructions",
    2,
  );
}
if (!Number.isFinite(options.timeoutMs) || options.timeoutMs < 0) fail("--timeout-ms must be a non-negative number", usage, 2);

const cwd = path.resolve(options.cwd);
try {
  if (!statSync(cwd).isDirectory()) throw new Error("not a directory");
} catch {
  fail(`working directory does not exist: ${quoted(cwd)}`, "Pass an existing directory with --cwd", 2);
}

const handoffFile = path.resolve(options.handoffFile);
let handoff;
try {
  handoff = readFileSync(handoffFile, "utf8").trim();
} catch {
  fail(`handoff file is unreadable: ${quoted(handoffFile)}`, "Pass a readable file with --handoff-file", 2);
}
if (!handoff) fail("handoff file is empty", "Add the owned outcome and required context to the handoff file", 2);

const herdr = findExecutable("herdr", process.env.HERDR_BIN);
const created = parseJsonOutput(
  run(herdr, [
    "workspace",
    "create",
    "--cwd",
    cwd,
    "--label",
    options.name,
    "--no-focus",
  ]),
  "workspace creation",
);
const workspace = created?.result?.workspace;
const rootPane = created?.result?.root_pane;
if (!workspace?.workspace_id || !rootPane?.pane_id) {
  if (workspace?.workspace_id) run(herdr, ["workspace", "close", workspace.workspace_id]);
  fail("workspace creation returned incomplete identifiers", "Inspect `herdr workspace list` and retry");
}
const cleanupWorkspace = () => {
  run(herdr, ["workspace", "close", workspace.workspace_id]);
};
const deadline = Date.now() + options.timeoutMs;
const start = startAgentWhenShellReady({
  herdr,
  name: options.name,
  paneId: rootPane.pane_id,
  deadline,
  cleanup: cleanupWorkspace,
});
requireSuccess(
  run(herdr, ["pane", "send-text", rootPane.pane_id, `@${handoffFile}`]),
  "handoff entry",
  cleanupWorkspace,
);
requireSuccess(
  run(herdr, ["pane", "send-keys", rootPane.pane_id, "Enter"]),
  "handoff submission",
  cleanupWorkspace,
);
if (options.focus) {
  parseJsonOutput(
    run(herdr, ["workspace", "focus", workspace.workspace_id]),
    "workspace focus",
    cleanupWorkspace,
  );
}

let agent = start?.result?.agent;
while (Date.now() <= deadline) {
  const get = run(herdr, ["agent", "get", options.name]);
  if (get.status === 0) {
    try {
      const candidate = JSON.parse(get.stdout)?.result?.agent;
      if (candidate) agent = candidate;
      if (candidate?.agent === "pi" && candidate?.agent_session && candidate?.agent_status !== "unknown") break;
    } catch {
      // Retry until the verification deadline.
    }
  }
  if (Date.now() >= deadline) break;
  sleep(100);
}

if (agent?.agent !== "pi" || !agent?.agent_session || agent?.agent_status === "unknown") {
  cleanupWorkspace();
  fail("session launch was not verified before the timeout", "Retry the handoff after checking `herdr status server`");
}

process.stdout.write(`session:\n  name: ${quoted(agent.name ?? options.name)}\n  terminal_id: ${quoted(agent.terminal_id)}\n  cwd: ${quoted(agent.cwd ?? cwd)}\n  status: ${quoted(agent.agent_status)}\n  focus: ${options.focus}\n  workspace_id: ${quoted(workspace.workspace_id)}\n  workspace_label: ${quoted(workspace.label ?? options.name)}\n  session_path: ${quoted(agent.agent_session.value)}\n`);
