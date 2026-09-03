#!/usr/bin/env node
import { createHash, randomBytes } from "node:crypto";
import { execFile, execFileSync, spawn } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const evalRoot = dirname(fileURLToPath(import.meta.url));
const agentRoot = dirname(evalRoot);
const argumentsMap = parseArguments(process.argv.slice(2));
if (!argumentsMap.case) usage();

const catalog = JSON.parse(await readFile(join(evalRoot, "catalog.json"), "utf8"));
const caseDirectory = join(evalRoot, "cases", argumentsMap.case);
const caseDefinition = JSON.parse(await readFile(join(caseDirectory, "case.json"), "utf8"));
const selectedModels = argumentsMap.models
  ? argumentsMap.models.split(",").filter(Boolean)
  : caseDefinition.models;
const trials = argumentsMap.trials ? positiveInteger(argumentsMap.trials, "--trials") : caseDefinition.trials;
const matrix = [];
for (const model of selectedModels) {
  if (!catalog.models[model]) throw new Error(`Unknown model ${JSON.stringify(model)}.`);
  for (const candidate of caseDefinition.candidates) {
    if (!catalog.candidates[candidate]) throw new Error(`Unknown candidate ${JSON.stringify(candidate)}.`);
    for (let trial = 1; trial <= trials; trial += 1) matrix.push({ model, candidate, trial });
  }
}
shuffle(matrix);

if (argumentsMap.plan) {
  process.stdout.write(`${JSON.stringify({ case: caseDefinition.id, runs: matrix }, null, 2)}\n`);
  process.exit(0);
}

const runId = new Date().toISOString().replaceAll(/[-:.]/g, "");
const runDirectory = join(evalRoot, "runs", `${caseDefinition.id}-${runId}`);
await mkdir(runDirectory, { recursive: true });
const aliases = ["alder", "birch", "cedar", "dune", "ember", "flint", "grove", "harbor", "islet", "juniper", "kestrel", "linden"];
const runManifest = {
  version: 1,
  case: caseDefinition.id,
  question: caseDefinition.question,
  source: caseDefinition.source,
  createdAt: new Date().toISOString(),
  runs: []
};

for (let index = 0; index < matrix.length; index += 1) {
  const condition = matrix[index];
  const alias = `${aliases[index % aliases.length]}-${randomBytes(3).toString("hex")}`;
  process.stderr.write(`Running ${index + 1}/${matrix.length}: ${condition.model} ${condition.candidate}\n`);
  const result = await executeTrial({
    alias,
    condition,
    catalog,
    caseDefinition,
    caseDirectory,
    runDirectory
  });
  runManifest.runs.push(result);
  await writeFile(join(runDirectory, "manifest.json"), `${JSON.stringify(runManifest, null, 2)}\n`);
}

process.stdout.write(`${runDirectory}\n`);

async function executeTrial({ alias, condition, catalog, caseDefinition, caseDirectory, runDirectory }) {
  const scratch = await mkdtemp(join(tmpdir(), `${alias}-`));
  const workspace = join(scratch, "repository");
  const sessionDirectory = join(scratch, ".sessions");
  const resourcesDirectory = join(scratch, ".resources");
  const artifactDirectory = join(runDirectory, alias);
  await mkdir(workspace, { recursive: true });
  await mkdir(sessionDirectory, { recursive: true });
  await mkdir(resourcesDirectory, { recursive: true });
  await mkdir(artifactDirectory, { recursive: true });

  const archive = join(scratch, "source.tar");
  execFileSync("git", ["-C", caseDefinition.source.repository, "archive", "--format=tar", "-o", archive, caseDefinition.source.revision]);
  execFileSync("tar", ["-xf", archive, "-C", workspace]);
  execFileSync("git", ["init", "-q"], { cwd: workspace });
  execFileSync("git", ["config", "user.name", "Configured Agent"], { cwd: workspace });
  execFileSync("git", ["config", "user.email", "agent@example.invalid"], { cwd: workspace });
  execFileSync("git", ["add", "."], { cwd: workspace });
  execFileSync("git", ["commit", "-qm", "Initial repository"], { cwd: workspace });

  const model = catalog.models[condition.model];
  const candidate = catalog.candidates[condition.candidate];
  let prompt = caseDefinition.prompt;
  const piArguments = [
    "--no-skills",
    "--no-extensions",
    "--no-prompt-templates",
    "--model", model.selector,
    "--thinking", model.thinking,
    "--session", join(sessionDirectory, "session.jsonl")
  ];
  let copiedSkill;
  if (candidate.kind === "skill") {
    const sourceSkill = resolve(evalRoot, candidate.path);
    copiedSkill = join(resourcesDirectory, "skill");
    await cp(dirname(sourceSkill), copiedSkill, { recursive: true });
    piArguments.push("--skill", join(copiedSkill, "SKILL.md"));
    prompt = `/skill:${candidate.invocation}\n${prompt}`;
  }
  piArguments.push("--print", prompt);

  const stdoutPath = join(artifactDirectory, "stdout.txt");
  const stderrPath = join(artifactDirectory, "stderr.txt");
  const startedAt = Date.now();
  const processResult = await runProcess("pi", piArguments, {
    cwd: workspace,
    stdoutPath,
    stderrPath,
    timeoutMs: caseDefinition.timeoutSeconds * 1000
  });
  const durationMs = Date.now() - startedAt;
  const sessionFile = join(sessionDirectory, "session.jsonl");
  const usage = await readUsage(sessionFile);
  const sessionText = await readFile(sessionFile, "utf8").catch(() => "");
  const treatmentDelivered = candidate.kind === "control"
    ? true
    : sessionText.includes("# Create a verification skill");

  const graderPath = join(caseDirectory, caseDefinition.grader);
  const gradeResult = await execFileResult("node", [graderPath, workspace, sessionFile], { cwd: workspace });
  await writeFile(join(artifactDirectory, "grade.json"), gradeResult.stdout || `${JSON.stringify({ graderError: gradeResult.stderr, code: gradeResult.code }, null, 2)}\n`);
  await writeFile(join(artifactDirectory, "status.txt"), execFileSync("git", ["status", "--short"], { cwd: workspace, encoding: "utf8" }));
  await writeFile(join(artifactDirectory, "tracked.diff"), execFileSync("git", ["diff", "--binary"], { cwd: workspace }));
  await cp(sessionFile, join(artifactDirectory, "session.jsonl")).catch(() => {});
  await cp(join(workspace, ".pi"), join(artifactDirectory, "produced-pi"), { recursive: true }).catch(() => {});
  await rm(scratch, { recursive: true, force: true });

  return {
    alias,
    model: condition.model,
    modelSelector: model.selector,
    thinking: model.thinking,
    candidate: condition.candidate,
    trial: condition.trial,
    process: processResult,
    durationMs,
    usage,
    treatmentDelivered,
    grader: {
      code: gradeResult.code,
      validJson: isJson(gradeResult.stdout)
    },
    artifactDirectory: alias
  };
}

function runProcess(command, args, { cwd, stdoutPath, stderrPath, timeoutMs }) {
  return new Promise(async (resolvePromise) => {
    const stdoutFile = await import("node:fs").then(({ createWriteStream }) => createWriteStream(stdoutPath));
    const stderrFile = await import("node:fs").then(({ createWriteStream }) => createWriteStream(stderrPath));
    const child = spawn(command, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    child.stdout.pipe(stdoutFile);
    child.stderr.pipe(stderrFile);
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 5000).unref();
    }, timeoutMs);
    child.on("error", (error) => {
      clearTimeout(timer);
      stdoutFile.end();
      stderrFile.end();
      resolvePromise({ code: 1, signal: null, timedOut, launchError: error.message });
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      stdoutFile.end();
      stderrFile.end();
      resolvePromise({ code: code ?? 1, signal, timedOut });
    });
  });
}

function execFileResult(command, args, options) {
  return new Promise((resolvePromise) => {
    execFile(command, args, { ...options, encoding: "utf8", maxBuffer: 4 * 1024 * 1024 }, (error, stdout, stderr) => {
      resolvePromise({ code: typeof error?.code === "number" ? error.code : error ? 1 : 0, stdout, stderr });
    });
  });
}

async function readUsage(sessionFile) {
  const text = await readFile(sessionFile, "utf8").catch(() => "");
  const usage = { assistantTurns: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, recordedCost: 0, actualModels: [] };
  const models = new Set();
  for (const line of text.trim().split("\n").filter(Boolean)) {
    let entry;
    try { entry = JSON.parse(line); } catch { continue; }
    if (entry.type === "model_change") models.add(`${entry.provider}/${entry.modelId}`);
    const message = entry.type === "message" && entry.message?.role === "assistant" ? entry.message : undefined;
    if (!message) continue;
    usage.assistantTurns += 1;
    usage.input += message.usage?.input ?? 0;
    usage.output += message.usage?.output ?? 0;
    usage.cacheRead += message.usage?.cacheRead ?? 0;
    usage.cacheWrite += message.usage?.cacheWrite ?? 0;
    usage.totalTokens += message.usage?.totalTokens ?? 0;
    usage.recordedCost += message.usage?.cost?.total ?? 0;
    if (message.provider && message.model) models.add(`${message.provider}/${message.model}`);
  }
  usage.actualModels = [...models];
  return usage;
}

function parseArguments(values) {
  const parsed = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === "--plan") parsed.plan = true;
    else if (["--case", "--models", "--trials"].includes(value)) parsed[value.slice(2)] = values[++index];
    else usage();
  }
  return parsed;
}

function positiveInteger(value, name) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new Error(`${name} must be a positive integer.`);
  return parsed;
}

function shuffle(values) {
  for (let index = values.length - 1; index > 0; index -= 1) {
    const swap = randomBytes(4).readUInt32BE(0) % (index + 1);
    [values[index], values[swap]] = [values[swap], values[index]];
  }
}

function isJson(value) {
  try { JSON.parse(value); return true; } catch { return false; }
}

function usage() {
  console.error("usage: node eval/run.mjs --case <id> [--models id,id] [--trials N] [--plan]");
  process.exit(64);
}
