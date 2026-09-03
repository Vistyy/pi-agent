#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const runDirectory = resolve(process.argv[2] ?? "");
if (!process.argv[2]) {
  console.error("usage: node eval/summarize.mjs <run-directory>");
  process.exit(64);
}
const manifest = JSON.parse(await readFile(join(runDirectory, "manifest.json"), "utf8"));
const rows = [];
for (const run of manifest.runs) {
  let grade = {};
  try { grade = JSON.parse(await readFile(join(runDirectory, run.artifactDirectory, "grade.json"), "utf8")); } catch {}
  rows.push({
    model: run.model,
    candidate: run.candidate,
    valid: run.process.code === 0
      && !run.process.timedOut
      && run.treatmentDelivered
      && run.grader.validJson
      && run.usage.actualModels.length === 1
      && run.usage.actualModels[0] === run.modelSelector,
    deterministicPass: grade.deterministicPass ?? null,
    semanticReviewRequired: grade.semanticReviewRequired?.length ?? null,
    turns: run.usage.assistantTurns,
    freshTokens: run.usage.input + run.usage.output,
    cacheRead: run.usage.cacheRead,
    totalTokens: run.usage.totalTokens,
    recordedCost: run.usage.recordedCost,
    durationSeconds: Math.round(run.durationMs / 100) / 10
  });
}
process.stdout.write(`${JSON.stringify({ case: manifest.case, question: manifest.question, rows }, null, 2)}\n`);
