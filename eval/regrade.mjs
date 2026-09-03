#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const evalRoot = dirname(fileURLToPath(import.meta.url));
const runDirectory = resolve(process.argv[2] ?? "");
if (!process.argv[2]) {
  console.error("usage: node eval/regrade.mjs <run-directory>");
  process.exit(64);
}

const manifest = JSON.parse(await readFile(join(runDirectory, "manifest.json"), "utf8"));
const caseDirectory = join(evalRoot, "cases", manifest.case);
const caseDefinition = JSON.parse(await readFile(join(caseDirectory, "case.json"), "utf8"));
for (const run of manifest.runs) {
  const scratch = await mkdtemp(join(tmpdir(), "skill-eval-regrade-"));
  const workspace = join(scratch, "repository");
  try {
    await mkdir(workspace);
    const archive = join(scratch, "source.tar");
    execFileSync("git", ["-C", caseDefinition.source.repository, "archive", "--format=tar", "-o", archive, caseDefinition.source.revision]);
    execFileSync("tar", ["-xf", archive, "-C", workspace]);
    execFileSync("git", ["init", "-q"], { cwd: workspace });
    execFileSync("git", ["config", "user.name", "Evaluation Regrader"], { cwd: workspace });
    execFileSync("git", ["config", "user.email", "eval@example.invalid"], { cwd: workspace });
    execFileSync("git", ["add", "."], { cwd: workspace });
    execFileSync("git", ["commit", "-qm", "Initial repository"], { cwd: workspace });
    const artifactDirectory = join(runDirectory, run.artifactDirectory);
    await cp(join(artifactDirectory, "produced-pi"), join(workspace, ".pi"), { recursive: true });
    const grade = execFileSync("node", [join(caseDirectory, caseDefinition.grader), workspace, join(artifactDirectory, "session.jsonl")], {
      cwd: workspace,
      encoding: "utf8"
    });
    await writeFile(join(artifactDirectory, "grade.json"), grade);
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}
