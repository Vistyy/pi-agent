#!/usr/bin/env node

import { accessSync, constants, readFileSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const usage = "start-separate-session --name <name> --cwd <path> --transfer-file <path> [--timeout-ms <milliseconds>]";

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
  process.stdout.write(`${usage}\n\nRequired:\n  --name <name>           Descriptive Herdr workspace and Pi session name\n  --cwd <path>            Working directory for the new session\n  --transfer-file <path>  Compact transfer brief used as the initial Pi prompt\n\nOptional:\n  --timeout-ms <number>   Shell readiness and Pi verification timeout greater than 3000 ms (default: 10000)\n  --help                  Show this help\n\nEnvironment:\n  HERDR_BIN               Override the Herdr executable\n\nExamples:\n  start-separate-session --name audit-agent-instructions --cwd ~/.pi/agent --transfer-file /tmp/transfer.md\n`);
}

function fail(message, suggestion, code = 1) {
  process.stdout.write(`error: ${message}\n`);
  if (suggestion) process.stdout.write(`help: ${suggestion}\n`);
  process.exit(code);
}

function parseArgs(argv) {
  const result = { timeoutMs: 10_000 };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help") {
      result.help = true;
      continue;
    }
    const key = {
      "--name": "name",
      "--cwd": "cwd",
      "--transfer-file": "transferFile",
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

function startAgentWhenShellReady({ herdr, name, paneId, deadline, cleanup }) {
  while (true) {
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 3_000) {
      cleanup?.();
      fail(
        "session launch did not have enough time remaining for Herdr agent readiness",
        "Retry with --timeout-ms greater than 3000",
      );
    }
    const args = [
      "agent",
      "start",
      name,
      "--kind",
      "pi",
      "--pane",
      paneId,
      "--timeout",
      String(Math.min(remainingMs, 300_000)),
      "--",
      "--name",
      name,
    ];
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
if (!options.transferFile) fail("--transfer-file is required", usage, 2);
if (options.name.length > 32 || !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)+$/.test(options.name)) {
  fail(
    "--name must be a descriptive kebab-case name of at most 32 characters",
    "Use a name such as audit-agent-instructions",
    2,
  );
}
if (!Number.isInteger(options.timeoutMs) || options.timeoutMs <= 3_000)
  fail("--timeout-ms must be an integer greater than 3000", usage, 2);

const cwd = path.resolve(options.cwd);
try {
  if (!statSync(cwd).isDirectory()) throw new Error("not a directory");
} catch {
  fail(`working directory does not exist: ${quoted(cwd)}`, "Pass an existing directory with --cwd", 2);
}

const transferFile = path.resolve(options.transferFile);
let transferBrief;
try {
  transferBrief = readFileSync(transferFile, "utf8").trim();
} catch {
  fail(`transfer file is unreadable: ${quoted(transferFile)}`, "Pass a readable file with --transfer-file", 2);
}
if (!transferBrief)
  fail("transfer file is empty", "Add the owned outcome and required context to the transfer file", 2);

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
const prompted = parseJsonOutput(
  run(herdr, ["agent", "prompt", options.name, `@${transferFile}`]),
  "transfer submission",
  cleanupWorkspace,
);
if (prompted?.result?.type !== "agent_prompted") {
  cleanupWorkspace();
  fail("transfer submission returned an incomplete result", "Inspect `herdr agent get` and retry");
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
  fail("session launch was not verified before the timeout", "Retry the Session transfer after checking `herdr status server`");
}

process.stdout.write(`session:\n  name: ${quoted(agent.name ?? options.name)}\n  terminal_id: ${quoted(agent.terminal_id)}\n  cwd: ${quoted(agent.cwd ?? cwd)}\n  status: ${quoted(agent.agent_status)}\n  focus: false\n  workspace_id: ${quoted(workspace.workspace_id)}\n  workspace_label: ${quoted(workspace.label ?? options.name)}\n  session_path: ${quoted(agent.agent_session.value)}\n`);
