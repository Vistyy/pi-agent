#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const [workspace, sessionFile] = process.argv.slice(2);
if (!workspace || !sessionFile) {
  console.error("usage: node grade.mjs <workspace> <session-file>");
  process.exit(64);
}

const status = execFileSync("git", ["status", "--porcelain=v1"], { cwd: workspace, encoding: "utf8" }).trim().split("\n").filter(Boolean);
const changedPaths = status.map((line) => line.slice(3));
const allowedPaths = new Set([
  "src/task/adapters/sqlite/sqliteTaskPersistence.ts",
  "test/task/task-dependency-persistence.test.ts"
]);
const outsideAllowed = changedPaths.filter((path) => !allowedPaths.has(path));
const source = await readFile(join(workspace, "src/task/adapters/sqlite/sqliteTaskPersistence.ts"), "utf8");
const test = await readFile(join(workspace, "test/task/task-dependency-persistence.test.ts"), "utf8");
const selfRejectionPresent = /prerequisiteTaskId === dependentTaskId[\s\S]{0,160}dependency_self/.test(source);
const durableCoveragePresent = /\[\["BY-3"\],\s*"dependency_self"\]/.test(test)
  && /prerequisites:\s*\[\{ id: "BY-1"/.test(test);

let focusedTestPassed = false;
try {
  execFileSync("pnpm", ["exec", "vitest", "run", "test/task/task-dependency-persistence.test.ts"], {
    cwd: workspace,
    encoding: "utf8",
    timeout: 180000
  });
  focusedTestPassed = true;
} catch {}

const boundary = await verifyCliBoundary(workspace);
const trajectory = (await readFile(sessionFile, "utf8")).trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
const bashCommands = trajectory.flatMap((entry) => {
  const message = entry.type === "message" ? entry.message : undefined;
  if (message?.role !== "assistant" || !Array.isArray(message.content)) return [];
  return message.content.filter((part) => part.type === "toolCall" && part.name === "bash").map((part) => String(part.arguments?.command ?? ""));
});
const modelRanFocusedEvidence = bashCommands.some((command) => /task-dependency-persistence|vitest|pnpm test/.test(command));
const modelExercisedCli = bashCommands.some((command) => /task dependencies add|dist\/main\.js|(^|\s)by\s/.test(command));

const gates = {
  exactScope: changedPaths.length === 2 && outsideAllowed.length === 0,
  selfRejectionPresent,
  durableCoveragePresent,
  focusedTestPassed,
  cliRejectsSelfDependency: boundary.rejected,
  cliPreservesGraph: boundary.graphPreserved,
  modelRanFocusedEvidence,
  modelExercisedCli
};
process.stdout.write(`${JSON.stringify({
  version: 1,
  gates,
  deterministicPass: Object.values(gates).every(Boolean),
  observations: { changedPaths, outsideAllowed, boundary, bashCommandCount: bashCommands.length },
  semanticReviewRequired: [
    "Whether the fix is placed at the owning validation boundary.",
    "Whether retained coverage is the smallest sufficient protection for the regression.",
    "Whether the model's verification claims stay within the evidence it collected."
  ]
}, null, 2)}\n`);

async function verifyCliBoundary(root) {
  const scratch = await mkdtemp(join(tmpdir(), "but-why-self-dependency-grade-"));
  const repository = join(scratch, "repository");
  const home = join(scratch, "home");
  try {
    execFileSync("git", ["init", "-q", "--initial-branch=main", repository]);
    await mkdir(home);
    await writeFile(join(scratch, "task.md"), "Task used for dependency verification.\n");
    execFileSync("just", ["build"], { cwd: root, stdio: "ignore", timeout: 180000 });
    const env = { ...process.env, HOME: home, XDG_CONFIG_HOME: join(scratch, "config"), XDG_STATE_HOME: join(scratch, "state") };
    const run = (...args) => spawnSync("node", [join(root, "dist/main.js"), ...args], { cwd: repository, env, encoding: "utf8" });
    run("init", "--id-prefix", "BY");
    run("task", "create", "--title", "Self dependency", "--file", join(scratch, "task.md"));
    const rejection = run("task", "dependencies", "add", "BY-1", "--depends-on", "BY-1");
    const shown = run("task", "show", "BY-1");
    const rejectionText = `${rejection.stdout}\n${rejection.stderr}`;
    const shownValue = JSON.parse(shown.stdout || "{}");
    return {
      rejected: rejection.status !== 0 && /dependency_self|own prerequisite|itself/i.test(rejectionText),
      graphPreserved: Array.isArray(shownValue.task?.prerequisites) && shownValue.task.prerequisites.length === 0,
      rejectionStatus: rejection.status,
      showStatus: shown.status
    };
  } catch (error) {
    return { rejected: false, graphPreserved: false, error: error.message };
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}
