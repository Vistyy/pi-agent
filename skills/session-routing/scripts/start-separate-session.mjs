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
  process.stdout.write(`bin: ${quoted(homePath(scriptPath))}\ndescription: ${quoted("Start and verify a separate default Pi session through Herdr")}\nusage: ${quoted(usage)}\n`);
}

function help() {
  process.stdout.write(`${usage}\n\nRequired:\n  --name <name>           Descriptive Herdr and Pi session name\n  --cwd <path>            Working directory for the new session\n  --handoff-file <path>   Compact handoff used as the initial Pi prompt\n\nOptional:\n  --focus                 Focus the new session after launch\n  --timeout-ms <number>   Verification timeout in milliseconds (default: 10000)\n  --help                  Show this help\n\nEnvironment:\n  HERDR_BIN               Override the Herdr executable\n  PI_BIN                  Override the Pi executable\n\nExamples:\n  start-separate-session --name audit-agent-instructions --cwd ~/.pi/agent --handoff-file /tmp/handoff.md\n  start-separate-session --name continue-token-audit --cwd ~/.pi/agent --handoff-file /tmp/handoff.md --focus\n`);
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

function parseJsonOutput(result, operation) {
  if (result.error) fail(`${operation} could not execute`, "Check the configured executable and retry");
  let parsed;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    fail(`${operation} returned an unreadable result`, "Run `herdr status server` and retry");
  }
  if (result.status !== 0 || parsed.error) {
    const detail = parsed?.error?.message;
    fail(detail ? `${operation} failed: ${detail}` : `${operation} failed`, "Inspect `herdr agent list` and retry");
  }
  return parsed;
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
if (options.name.length > 64 || !/^[a-z0-9]+(?:-[a-z0-9]+)+$/.test(options.name)) {
  fail("--name must be a descriptive kebab-case name", "Use a name such as audit-agent-instructions", 2);
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
const pi = findExecutable("pi", process.env.PI_BIN);
const focusFlag = options.focus ? "--focus" : "--no-focus";
const start = parseJsonOutput(
  run(herdr, [
    "agent",
    "start",
    options.name,
    "--cwd",
    cwd,
    focusFlag,
    "--",
    pi,
    "--name",
    options.name,
    handoff,
  ]),
  "session launch",
);

const deadline = Date.now() + options.timeoutMs;
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
  fail("session launch was not verified before the timeout", `Run \`herdr agent get ${options.name}\` to inspect the session`);
}

process.stdout.write(`session:\n  name: ${quoted(agent.name ?? options.name)}\n  terminal_id: ${quoted(agent.terminal_id)}\n  cwd: ${quoted(agent.cwd ?? cwd)}\n  status: ${quoted(agent.agent_status)}\n  focus: ${options.focus}\n  session_path: ${quoted(agent.agent_session.value)}\n`);
