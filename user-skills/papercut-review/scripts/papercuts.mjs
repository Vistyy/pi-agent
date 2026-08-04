#!/usr/bin/env node

import { appendFile, mkdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const DATA_DIRECTORY = join(homedir(), ".pi", "agent", "papercuts");
const INBOX_PATH = join(DATA_DIRECTORY, "inbox.jsonl");
const ARCHIVE_PATH = join(DATA_DIRECTORY, "archive.jsonl");
const PROGRAM = fileURLToPath(import.meta.url);

class UsageError extends Error {}

async function main(args) {
  const [command, ...rest] = args;

  if (command === undefined) {
    const state = await loadState();
    print({
      bin: collapseHome(PROGRAM),
      description: "Prepare and disposition agent papercuts for the papercut-review skill.",
      pending: pendingEntries(state).length,
      commands: ["prepare", "resolve", "--help"],
    });
    return;
  }

  if (command === "--help" || command === "-h") {
    printHelp();
    return;
  }

  if (command === "prepare") {
    if (rest.includes("--help") || rest.includes("-h")) {
      printPrepareHelp();
      return;
    }
    await prepare(rest);
    return;
  }

  if (command === "resolve") {
    if (rest.includes("--help") || rest.includes("-h")) {
      printResolveHelp();
      return;
    }
    await resolveEntries(rest);
    return;
  }

  throw new UsageError(`Unknown command: ${command}`);
}

async function prepare(args) {
  let limit = DEFAULT_LIMIT;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument !== "--limit") throw new UsageError(`Unknown prepare argument: ${argument}`);
    const value = args[index + 1];
    if (value === undefined) throw new UsageError("--limit requires a value.");
    limit = parseLimit(value);
    index += 1;
  }

  const state = await loadState();
  const pending = pendingEntries(state);
  const entries = pending.slice(0, limit);

  print({
    operation: "prepare",
    pendingTotal: pending.length,
    returned: entries.length,
    hasMore: entries.length < pending.length,
    limit,
    entries,
  });
}

async function resolveEntries(args) {
  let disposition;
  let note;
  const ids = [];

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    const value = args[index + 1];
    if (argument === "--disposition") {
      if (value === undefined) throw new UsageError("--disposition requires a value.");
      disposition = value;
      index += 1;
      continue;
    }
    if (argument === "--id") {
      if (value === undefined) throw new UsageError("--id requires a value.");
      ids.push(value);
      index += 1;
      continue;
    }
    if (argument === "--note") {
      if (value === undefined) throw new UsageError("--note requires a value.");
      note = value.trim();
      index += 1;
      continue;
    }
    throw new UsageError(`Unknown resolve argument: ${argument}`);
  }

  if (disposition !== "follow-up" && disposition !== "dismissed") {
    throw new UsageError("--disposition must be follow-up or dismissed.");
  }
  if (ids.length === 0) throw new UsageError("At least one --id is required.");
  if (new Set(ids).size !== ids.length) throw new UsageError("Each --id must be unique.");

  const state = await loadState();
  const observations = new Map(state.inbox.map((entry) => [entry.id, entry]));
  const existing = new Map(state.archive.map((entry) => [entry.entryId, entry]));
  const unknown = ids.filter((id) => !observations.has(id));
  if (unknown.length > 0) {
    throw new Error(`Unknown papercut IDs: ${unknown.join(", ")}`);
  }

  const conflicting = ids.filter((id) => {
    const archived = existing.get(id);
    return archived !== undefined && archived.disposition !== disposition;
  });
  if (conflicting.length > 0) {
    throw new Error(`Papercut IDs already have a different disposition: ${conflicting.join(", ")}`);
  }

  const unresolved = ids.filter((id) => !existing.has(id));
  if (unresolved.length === 0) {
    print({
      operation: "resolve",
      disposition,
      resolved: 0,
      noOp: ids.length,
      ids,
    });
    return;
  }

  const reviewedAt = new Date().toISOString();
  const records = unresolved.map((entryId) => ({
    entryId,
    disposition,
    reviewedAt,
    ...(note ? { note } : {}),
  }));

  await mkdir(dirname(ARCHIVE_PATH), { recursive: true });
  await appendFile(
    ARCHIVE_PATH,
    records.map((record) => JSON.stringify(record)).join("\n") + "\n",
    "utf8",
  );

  print({
    operation: "resolve",
    disposition,
    resolved: unresolved.length,
    noOp: ids.length - unresolved.length,
    ids,
  });
}

async function loadState() {
  const inbox = await readJsonLines(INBOX_PATH, validateInboxEntry);
  const archive = await readJsonLines(ARCHIVE_PATH, validateArchiveEntry);
  const observationIds = new Set();
  const dispositions = new Map();

  for (const entry of inbox) {
    if (observationIds.has(entry.id)) {
      throw new Error(`Duplicate inbox ID: ${entry.id}.`);
    }
    observationIds.add(entry.id);
  }

  for (const entry of archive) {
    if (!observationIds.has(entry.entryId)) {
      throw new Error(`Archive references unknown papercut ${entry.entryId}.`);
    }
    const previous = dispositions.get(entry.entryId);
    if (previous !== undefined && previous.disposition !== entry.disposition) {
      throw new Error(`Conflicting archive dispositions for papercut ${entry.entryId}.`);
    }
    dispositions.set(entry.entryId, entry);
  }

  return { inbox, archive, dispositions };
}

function pendingEntries(state) {
  return state.inbox
    .filter((entry) => !state.dispositions.has(entry.id))
    .sort((left, right) =>
      left.timestamp.localeCompare(right.timestamp) || left.id.localeCompare(right.id),
    );
}

async function readJsonLines(path, validate) {
  let source;
  try {
    source = await readFile(path, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }

  const records = [];
  for (const [index, line] of source.split("\n").entries()) {
    if (!line.trim()) continue;
    let value;
    try {
      value = JSON.parse(line);
    } catch {
      throw new Error(`${path}:${index + 1} contains invalid JSON.`);
    }
    validate(value, path, index + 1);
    records.push(value);
  }
  return records;
}

function validateInboxEntry(value, path, line) {
  requireRecord(value, path, line);
  requireString(value.id, "id", path, line);
  requireTimestamp(value.timestamp, "timestamp", path, line);
  if (value.sessionId !== null) requireString(value.sessionId, "sessionId", path, line);
  requireString(value.project, "project", path, line);
  requireString(value.text, "text", path, line);
}

function validateArchiveEntry(value, path, line) {
  requireRecord(value, path, line);
  requireString(value.entryId, "entryId", path, line);
  if (value.disposition !== "follow-up" && value.disposition !== "dismissed") {
    throw new Error(`${path}:${line} has an invalid disposition.`);
  }
  requireTimestamp(value.reviewedAt, "reviewedAt", path, line);
  if (value.note !== undefined) requireString(value.note, "note", path, line);
}

function requireRecord(value, path, line) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${path}:${line} must contain a JSON object.`);
  }
}

function requireString(value, field, path, line) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${path}:${line} has an invalid ${field}.`);
  }
}

function requireTimestamp(value, field, path, line) {
  requireString(value, field, path, line);
  if (Number.isNaN(Date.parse(value))) {
    throw new Error(`${path}:${line} has an invalid ${field}.`);
  }
}

function parseLimit(value) {
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    throw new UsageError(`--limit must be an integer from 1 to ${MAX_LIMIT}.`);
  }
  return limit;
}

function collapseHome(path) {
  const home = homedir();
  return path === home ? "~" : path.startsWith(`${home}/`) ? `~/${path.slice(home.length + 1)}` : path;
}

function print(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function printHelp() {
  process.stdout.write(`papercuts - prepare and disposition agent papercuts

Usage:
  papercuts
  papercuts prepare [--limit <1-${MAX_LIMIT}>]
  papercuts resolve --disposition <follow-up|dismissed> --id <id> [--id <id>...] [--note <text>]
  papercuts <command> --help
`);
}

function printPrepareHelp() {
  process.stdout.write(`Usage: papercuts prepare [--limit <1-${MAX_LIMIT}>]

Return the oldest pending papercuts in a stable review packet.
The default limit is ${DEFAULT_LIMIT}.

Examples:
  papercuts prepare
  papercuts prepare --limit 20
`);
}

function printResolveHelp() {
  process.stdout.write(`Usage: papercuts resolve --disposition <follow-up|dismissed> --id <id> [--id <id>...] [--note <text>]

Append a disposition for each selected papercut.
Repeating the same disposition is a successful no-op.

Examples:
  papercuts resolve --disposition follow-up --id <id>
  papercuts resolve --disposition dismissed --id <id> --id <id> --note "One-off environment failure"
`);
}

main(process.argv.slice(2)).catch((error) => {
  const usage = error instanceof UsageError;
  print({
    error: error instanceof Error ? error.message : String(error),
    help: usage ? "Run papercuts --help for usage." : "Correct the papercut data or command and retry.",
  });
  process.exitCode = usage ? 2 : 1;
});
